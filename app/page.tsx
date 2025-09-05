"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { Search, ChevronRight, Check, AlertCircle, Music, Heart, User, X } from "lucide-react"

interface SpotifyPlaylist {
  id: string
  name: string
  tracks: { total: number }
  owner: { display_name: string }
  images: { url: string }[]
}

interface SyncHistory {
  id: string
  type: "manual" | "scheduled"
  status: "success" | "error"
  playlistCount: number
  songCount: number
  timestamp: Date
  message: string
}

export default function PlaylistSync() {
  const { toast } = useToast()
  const [primaryAccount, setPrimaryAccount] = useState<any>(null)
  const [secondaryAccount, setSecondaryAccount] = useState<any>(null)
  const [primaryPlaylists, setPrimaryPlaylists] = useState<SpotifyPlaylist[]>([])
  const [secondaryPlaylists, setSecondaryPlaylists] = useState<SpotifyPlaylist[]>([])
  const [selectedPlaylists, setSelectedPlaylists] = useState<string[]>([])
  const [selectedSecondaryPlaylists, setSelectedSecondaryPlaylists] = useState<string[]>([])
  const [syncDirection, setSyncDirection] = useState("one-way")
  const [searchTerm, setSearchTerm] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [syncHistory, setSyncHistory] = useState<SyncHistory[]>([])
  const [authError, setAuthError] = useState<{ type: string; message: string } | null>(null)

  useEffect(() => {
    loadUserData()
    loadSyncHistory()
    checkAuthCallback()
  }, [])

  const loadUserData = async () => {
    // This function is now handled by loadStoredAuthData
  }

  const loadSyncHistory = async () => {
    try {
      const stored = localStorage.getItem("spotifySync_history")
      if (stored) {
        const history = JSON.parse(stored).map((item: any) => ({
          ...item,
          timestamp: new Date(item.timestamp),
        }))
        setSyncHistory(history)
      }
    } catch (error) {
      console.error("Failed to load sync history:", error)
    }
  }

  const saveSyncHistory = (newItem: SyncHistory) => {
    const updated = [newItem, ...syncHistory].slice(0, 10)
    setSyncHistory(updated)
    localStorage.setItem("spotifySync_history", JSON.stringify(updated))
  }

  const connectSpotifyAccount = async (accountType: "primary" | "secondary") => {
    setIsLoading(true)
    try {
      const response = await fetch("/api/spotify/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountType }),
      })

      if (response.ok) {
        const { authUrl } = await response.json()
        window.location.href = authUrl
      } else {
        throw new Error("Failed to initiate OAuth")
      }
    } catch (error) {
      console.error("Failed to connect account:", error)
      toast({
        title: "Connection failed",
        description: "Failed to connect to Spotify. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const loadPrimaryPlaylists = async () => {
    const token = getCookie("spotify_primary_token")
    if (!token) return

    try {
      const response = await fetch("/api/spotify/playlists?account=primary")

      if (response.ok) {
        const data = await response.json()
        setPrimaryPlaylists(data || [])
      }
    } catch (error) {
      console.error("Failed to load primary playlists:", error)
    }
  }

  const loadSecondaryPlaylists = async () => {
    const token = getCookie("spotify_secondary_token")
    if (!token) return

    try {
      const response = await fetch("/api/spotify/playlists?account=secondary")

      if (response.ok) {
        const data = await response.json()
        setSecondaryPlaylists(data || [])
      }
    } catch (error) {
      console.error("Failed to load secondary playlists:", error)
    }
  }

  const startSync = async () => {
    if (selectedPlaylists.length === 0 && selectedSecondaryPlaylists.length === 0) {
      toast({
        title: "No playlists selected",
        description: "Please select at least one playlist to sync.",
        variant: "destructive",
      })
      return
    }

    if (!secondaryAccount) {
      toast({
        title: "Secondary account required",
        description: "Please connect your secondary account first.",
        variant: "destructive",
      })
      return
    }

    setIsLoading(true)
    try {
      const response = await fetch("/api/spotify/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selectedPlaylists,
          selectedSecondaryPlaylists,
          syncDirection,
          syncFrequency: "daily",
        }),
      })

      if (response.ok) {
        const result = await response.json()
        const newHistoryItem: SyncHistory = {
          id: Date.now().toString(),
          type: "manual",
          status: "success",
          playlistCount: selectedPlaylists.length + selectedSecondaryPlaylists.length,
          songCount: result.totalSongs || 0,
          timestamp: new Date(),
          message: `Successfully synced ${selectedPlaylists.length + selectedSecondaryPlaylists.length} playlist${selectedPlaylists.length + selectedSecondaryPlaylists.length > 1 ? "s" : ""}`,
        }
        saveSyncHistory(newHistoryItem)
        toast({
          title: "Sync completed!",
          description: `${result.totalSongs || 0} songs transferred successfully.`,
        })
      } else {
        const error = await response.json()
        throw new Error(error.error || "Sync failed")
      }
    } catch (error) {
      console.error("Sync failed:", error)
      const errorHistoryItem: SyncHistory = {
        id: Date.now().toString(),
        type: "manual",
        status: "error",
        playlistCount: 0,
        songCount: 0,
        timestamp: new Date(),
        message: error instanceof Error ? error.message : "Sync failed - Connection error",
      }
      saveSyncHistory(errorHistoryItem)
      toast({
        title: "Sync failed",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const checkAuthCallback = () => {
    console.log("[v0] Checking auth callback, current URL:", window.location.href)
    const urlParams = new URLSearchParams(window.location.search)
    const connected = urlParams.get("connected")
    const user = urlParams.get("user")
    const error = urlParams.get("error")
    const errorDetails = urlParams.get("details")

    console.log("[v0] URL params - connected:", connected, "user:", user)

    if (error) {
      console.log("[v0] Auth error received:", error, errorDetails)
      let errorMessage = "Authentication failed. Please try again."

      if (error === "profile_fetch_failed") {
        errorMessage = decodeURIComponent(errorDetails || "Failed to fetch user profile")
      } else if (error === "token_exchange_failed") {
        errorMessage = "Failed to exchange authorization code. Please check your Spotify app configuration."
      } else if (error === "oauth_error") {
        errorMessage = `OAuth error: ${errorDetails || "Unknown error"}`
      }

      setAuthError({ type: error, message: errorMessage })

      window.history.replaceState({}, document.title, window.location.pathname)
      return
    }

    if (connected && user) {
      console.log("[v0] Found auth callback params, clearing URL and loading stored data")
      setAuthError(null)
      window.history.replaceState({}, document.title, window.location.pathname)

      loadStoredAuthData()
    } else {
      console.log("[v0] No callback params found, checking for existing stored auth")
      loadStoredAuthData()
    }
  }

  const loadStoredAuthData = () => {
    console.log("[v0] Loading stored auth data from cookies")

    const primaryToken = getCookie("spotify_primary_token")
    const primaryUserData = getCookie("spotify_primary_user")
    console.log("[v0] Primary token exists:", !!primaryToken, "Primary user data exists:", !!primaryUserData)

    if (primaryToken && primaryUserData) {
      try {
        const userData = JSON.parse(primaryUserData)
        console.log("[v0] Setting primary account:", userData.display_name)
        setPrimaryAccount(userData)
        loadPrimaryPlaylists()
      } catch (error) {
        console.error("[v0] Failed to parse primary user data:", error)
      }
    }

    const secondaryToken = getCookie("spotify_secondary_token")
    const secondaryUserData = getCookie("spotify_secondary_user")
    console.log("[v0] Secondary token exists:", !!secondaryToken, "Secondary user data exists:", !!secondaryUserData)

    if (secondaryToken && secondaryUserData) {
      try {
        const userData = JSON.parse(secondaryUserData)
        console.log("[v0] Setting secondary account:", userData.display_name)
        setSecondaryAccount(userData)
        loadSecondaryPlaylists()
      } catch (error) {
        console.error("[v0] Failed to parse secondary user data:", error)
      }
    }
  }

  const getCookie = (name: string) => {
    const value = `; ${document.cookie}`
    const parts = value.split(`; ${name}=`)
    const result = parts.length === 2 ? decodeURIComponent(parts.pop()?.split(";").shift() || "") : null
    console.log("[v0] Getting cookie", name, "result:", result ? "found" : "not found")
    return result
  }

  const filteredPlaylists = primaryPlaylists.filter((playlist) =>
    playlist.name.toLowerCase().includes(searchTerm.toLowerCase()),
  )

  const formatTimeAgo = (date: Date) => {
    const now = new Date()
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60))

    if (diffInHours < 1) return "Just now"
    if (diffInHours < 24) return `${diffInHours} hours ago`
    if (diffInHours < 48) return "Yesterday"
    return `${Math.floor(diffInHours / 24)} days ago`
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#181818] to-[#121212]">
      <header className="bg-black border-b border-[#404040] sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex justify-between items-center">
          <div className="flex items-center gap-2 sm:gap-3">
            <img
              src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/Spotify_Primary_Logo_RGB_Green-QBKd7gyEYHSO9Dhwxnf1CzNghHQpvw.png"
              alt="Spotify Logo"
              width="28"
              height="28"
              className="sm:w-8 sm:h-8 rounded-full"
            />
            <h1 className="text-lg sm:text-2xl font-bold text-white">Playlist Sync</h1>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-8 sm:space-y-12">
        {authError && (
          <Card className="bg-[rgba(226,33,52,0.1)] border-[#e22134] p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-[#e22134] flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="text-[#e22134] font-semibold mb-1">Authentication Error</h3>
                <p className="text-white text-sm leading-relaxed">{authError.message}</p>
                {authError.type === "profile_fetch_failed" && authError.message.includes("Development Mode") && (
                  <div className="mt-3 p-3 bg-[rgba(226,33,52,0.1)] rounded border border-[rgba(226,33,52,0.3)]">
                    <p className="text-white text-sm">
                      <strong>Quick Fix:</strong> Go to{" "}
                      <a
                        href="https://developer.spotify.com/dashboard"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#1DB954] hover:underline"
                      >
                        developer.spotify.com/dashboard
                      </a>
                      , select your app, go to "Users and Access", and add your email address to the user list.
                    </p>
                  </div>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setAuthError(null)}
                className="text-[#e22134] hover:bg-[rgba(226,33,52,0.1)] p-1"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </Card>
        )}

        <section className="space-y-6 sm:space-y-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-6 sm:mb-8">Connected Accounts</h2>
          <div className="grid grid-cols-1 gap-6 sm:gap-8">
            <Card
              className={`bg-[#282828] border p-4 sm:p-6 ${primaryAccount ? "border-[#1DB954] bg-[rgba(29,185,84,0.1)]" : "border-transparent"}`}
            >
              <div className="space-y-4">
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gradient-to-br from-[#1DB954] to-[#1ed760] flex items-center justify-center flex-shrink-0">
                    {primaryAccount && (
                      <span className="text-white font-bold text-xs sm:text-sm">
                        {primaryAccount.display_name?.charAt(0).toUpperCase() || "P"}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-white font-semibold text-sm sm:text-base">
                      {primaryAccount?.display_name || "Primary Account"}
                    </h3>
                    <p className="text-[#b3b3b3] text-xs sm:text-sm truncate">{primaryAccount?.email || ""}</p>
                    <Badge
                      className={`border-none text-xs font-semibold mt-1 ${
                        primaryAccount ? "bg-[rgba(29,185,84,0.2)] text-[#1DB954]" : "bg-[#3e3e3e] text-[#a7a7a7]"
                      }`}
                    >
                      {primaryAccount ? "CONNECTED" : "NOT CONNECTED"}
                    </Badge>
                  </div>
                </div>
                {primaryAccount ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-[#404040] text-white hover:bg-[#3e3e3e] hover:border-white bg-transparent text-xs sm:text-sm w-full"
                    onClick={() => {
                      setPrimaryAccount(null)
                      setPrimaryPlaylists([])
                      document.cookie = "spotify_primary_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;"
                      document.cookie = "spotify_primary_user=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;"
                      document.cookie = "spotify_primary_refresh=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;"
                    }}
                  >
                    Disconnect
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    className="bg-[#1DB954] hover:bg-[#1ed760] text-white text-xs sm:text-sm w-full"
                    onClick={() => connectSpotifyAccount("primary")}
                    disabled={isLoading}
                  >
                    Connect
                  </Button>
                )}
              </div>
            </Card>

            <Card
              className={`bg-[#282828] border p-4 sm:p-6 ${secondaryAccount ? "border-[#1DB954] bg-[rgba(29,185,84,0.1)]" : "border-transparent hover:bg-[#3e3e3e]"} transition-colors`}
            >
              <div className="space-y-4">
                <div className="flex items-center gap-3 sm:gap-4">
                  <div
                    className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gradient-to-br ${
                      secondaryAccount ? "from-[#1DB954] to-[#1ed760]" : "from-[#535353] to-[#3e3e3e]"
                    } flex items-center justify-center flex-shrink-0`}
                  >
                    {secondaryAccount && (
                      <span className="text-white font-bold text-xs sm:text-sm">
                        {secondaryAccount.display_name?.charAt(0).toUpperCase() || "S"}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-white font-semibold text-sm sm:text-base">
                      {secondaryAccount?.display_name || "Secondary Account"}
                    </h3>
                    <p className="text-[#b3b3b3] text-xs sm:text-sm truncate">{secondaryAccount?.email || ""}</p>
                    <Badge
                      className={`border-none text-xs font-semibold mt-1 ${
                        secondaryAccount ? "bg-[rgba(29,185,84,0.2)] text-[#1DB954]" : "bg-[#3e3e3e] text-[#a7a7a7]"
                      }`}
                    >
                      {secondaryAccount ? "CONNECTED" : "NOT CONNECTED"}
                    </Badge>
                  </div>
                </div>
                {secondaryAccount ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-[#404040] text-white hover:bg-[#3e3e3e] hover:border-white bg-transparent text-xs sm:text-sm w-full"
                    onClick={() => {
                      setSecondaryAccount(null)
                      setSecondaryPlaylists([])
                      document.cookie = "spotify_secondary_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;"
                      document.cookie = "spotify_secondary_user=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;"
                      document.cookie = "spotify_secondary_refresh=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;"
                    }}
                  >
                    Disconnect
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    className="bg-[#1DB954] hover:bg-[#1ed760] text-white text-xs sm:text-sm w-full"
                    onClick={() => connectSpotifyAccount("secondary")}
                    disabled={isLoading || !primaryAccount}
                  >
                    Connect
                  </Button>
                )}
              </div>
            </Card>
          </div>
        </section>

        <section>
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 sm:gap-0 mb-6 sm:mb-8">
            <h2 className="text-2xl sm:text-3xl font-bold text-white">Sync Configuration</h2>
            <Button
              className="bg-[#1DB954] hover:bg-[#1ed760] text-white px-6 sm:px-8 py-3 text-base sm:text-lg font-bold w-full sm:w-auto"
              onClick={startSync}
              disabled={isLoading || (selectedPlaylists.length === 0 && selectedSecondaryPlaylists.length === 0)}
            >
              Start Sync
            </Button>
          </div>

          <div>
            <h3 className="text-lg sm:text-xl font-semibold text-white mb-4">Sync Direction</h3>
            <RadioGroup value={syncDirection} onValueChange={setSyncDirection} className="space-y-3 sm:space-y-4">
              <div className="flex items-center space-x-3 p-3 sm:p-4 bg-[#282828] rounded-lg border border-[#1DB954] bg-[rgba(29,185,84,0.1)]">
                <RadioGroupItem value="one-way" id="one-way" className="border-[#1DB954] text-[#1DB954]" />
                <Label htmlFor="one-way" className="flex-1 cursor-pointer">
                  <div className="text-white font-semibold text-sm sm:text-base">One-way sync</div>
                  <div className="text-[#b3b3b3] text-xs sm:text-sm">Primary → Secondary</div>
                </Label>
              </div>
              <div className="flex items-center space-x-3 p-3 sm:p-4 bg-[#282828] rounded-lg hover:bg-[#3e3e3e] transition-colors">
                <RadioGroupItem value="two-way" id="two-way" className="border-[#404040]" />
                <Label htmlFor="two-way" className="flex-1 cursor-pointer">
                  <div className="text-white font-semibold text-sm sm:text-base">Two-way sync</div>
                  <div className="text-[#b3b3b3] text-xs sm:text-sm">Keep both accounts in sync</div>
                </Label>
              </div>
            </RadioGroup>
          </div>
        </section>

        <section>
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4 sm:mb-6">Select Playlists to Sync</h2>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8 items-start">
            <Card className="bg-[#282828] border-transparent overflow-hidden">
              <div className="p-4 sm:p-6 border-b border-[#404040]">
                <h3 className="text-lg sm:text-xl font-semibold text-white mb-4">Primary Account Playlists</h3>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-[#a7a7a7]" />
                  <Input
                    placeholder="Search playlists..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    disabled={!primaryAccount}
                    className="pl-10 bg-[#3e3e3e] border-[#404040] text-white placeholder:text-[#a7a7a7] focus:border-[#1DB954] disabled:opacity-50"
                  />
                </div>
              </div>

              <div className="max-h-80 sm:max-h-96 overflow-y-auto">
                {!primaryAccount ? (
                  <div className="text-center text-[#a7a7a7] p-6 sm:p-8">
                    <User className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-4 opacity-50" />
                    <p className="text-sm sm:text-base">Connect your primary account to view playlists</p>
                  </div>
                ) : filteredPlaylists.length === 0 ? (
                  <div className="text-center text-[#a7a7a7] p-6 sm:p-8">
                    <Music className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-4 opacity-50" />
                    <p className="text-sm sm:text-base">No playlists found</p>
                  </div>
                ) : (
                  filteredPlaylists.map((playlist) => (
                    <div
                      key={playlist.id}
                      className="flex items-center p-3 sm:p-4 gap-3 sm:gap-4 hover:bg-[#3e3e3e] transition-colors cursor-pointer"
                    >
                      <div className="w-10 h-10 sm:w-12 sm:h-12 rounded flex-shrink-0">
                        {playlist.images && playlist.images.length > 0 ? (
                          <img
                            src={playlist.images[0].url || "/placeholder.svg"}
                            alt={playlist.name}
                            className="w-full h-full object-cover rounded"
                          />
                        ) : playlist.name.toLowerCase().includes("liked") ? (
                          <div className="w-full h-full bg-gradient-to-br from-[#450af5] to-[#c4efd9] rounded flex items-center justify-center">
                            <Heart className="w-5 h-5 sm:w-6 sm:h-6 text-white fill-current" />
                          </div>
                        ) : (
                          <div className="w-full h-full bg-[#3e3e3e] rounded flex items-center justify-center">
                            <Music className="w-5 h-5 sm:w-6 sm:h-6 text-[#a7a7a7]" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-white font-semibold text-sm sm:text-base truncate">{playlist.name}</div>
                        <div className="text-[#b3b3b3] text-xs sm:text-sm">
                          {playlist.tracks.total} songs
                          {playlist.owner.display_name !== primaryAccount?.display_name &&
                            ` • Created by ${playlist.owner.display_name}`}
                        </div>
                      </div>
                      <Checkbox
                        checked={selectedPlaylists.includes(playlist.id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedPlaylists((prev) => [...prev, playlist.id])
                          } else {
                            setSelectedPlaylists((prev) => prev.filter((id) => id !== playlist.id))
                          }
                        }}
                        className="border-[#404040] data-[state=checked]:bg-[#1DB954] data-[state=checked]:border-[#1DB954] w-5 h-5 sm:w-4 sm:h-4"
                      />
                    </div>
                  ))
                )}
              </div>
            </Card>

            <div className="hidden lg:flex justify-center items-center">
              <div className="text-[#1DB954]">
                <ChevronRight className="w-6 h-6" />
              </div>
            </div>

            <Card className="bg-[#282828] border-transparent overflow-hidden">
              <div className="p-4 sm:p-6 border-b border-[#404040]">
                <h3 className="text-lg sm:text-xl font-semibold text-white mb-4">Secondary Account Playlists</h3>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-[#a7a7a7]" />
                  <Input
                    placeholder="Search playlists..."
                    disabled={!secondaryAccount}
                    className="pl-10 bg-[#3e3e3e] border-[#404040] text-white placeholder:text-[#a7a7a7] focus:border-[#1DB954] disabled:opacity-50"
                  />
                </div>
              </div>

              <div className="min-h-48 max-h-80 sm:max-h-96 overflow-y-auto">
                {!secondaryAccount ? (
                  <div className="text-center text-[#a7a7a7] p-6 sm:p-8">
                    <User className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-4 opacity-50" />
                    <p className="text-sm sm:text-base">Connect your secondary account to view playlists</p>
                  </div>
                ) : secondaryPlaylists.length === 0 ? (
                  <div className="text-center text-[#a7a7a7] p-6 sm:p-8">
                    <Music className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-4 opacity-50" />
                    <p className="text-sm sm:text-base">Loading playlists...</p>
                  </div>
                ) : (
                  secondaryPlaylists.map((playlist) => (
                    <div
                      key={playlist.id}
                      className="flex items-center p-3 sm:p-4 gap-3 sm:gap-4 hover:bg-[#3e3e3e] transition-colors cursor-pointer"
                    >
                      <div className="w-10 h-10 sm:w-12 sm:h-12 rounded flex-shrink-0">
                        {playlist.images && playlist.images.length > 0 ? (
                          <img
                            src={playlist.images[0].url || "/placeholder.svg"}
                            alt={playlist.name}
                            className="w-full h-full object-cover rounded"
                          />
                        ) : playlist.name.toLowerCase().includes("liked") ? (
                          <div className="w-full h-full bg-gradient-to-br from-[#450af5] to-[#c4efd9] rounded flex items-center justify-center">
                            <Heart className="w-5 h-5 sm:w-6 sm:h-6 text-white fill-current" />
                          </div>
                        ) : (
                          <div className="w-full h-full bg-[#3e3e3e] rounded flex items-center justify-center">
                            <Music className="w-5 h-5 sm:w-6 sm:h-6 text-[#a7a7a7]" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-white font-semibold text-sm sm:text-base truncate">{playlist.name}</div>
                        <div className="text-[#b3b3b3] text-xs sm:text-sm">
                          {playlist.tracks.total} songs
                          {playlist.owner.display_name !== secondaryAccount?.display_name &&
                            ` • Created by ${playlist.owner.display_name}`}
                        </div>
                      </div>
                      <Checkbox
                        checked={selectedSecondaryPlaylists.includes(playlist.id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedSecondaryPlaylists((prev) => [...prev, playlist.id])
                          } else {
                            setSelectedSecondaryPlaylists((prev) => prev.filter((id) => id !== playlist.id))
                          }
                        }}
                        className="border-[#404040] data-[state=checked]:bg-[#1DB954] data-[state=checked]:border-[#1DB954] w-5 h-5 sm:w-4 sm:h-4"
                      />
                    </div>
                  ))
                )}
              </div>
            </Card>
          </div>
        </section>

        <section>
          <div className="flex justify-between items-center mb-4 sm:mb-6">
            <h2 className="text-2xl sm:text-3xl font-bold text-white">Sync History</h2>
            <Button variant="ghost" className="text-[#b3b3b3] hover:text-white text-sm sm:text-base">
              View All
            </Button>
          </div>

          <div className="space-y-3 sm:space-y-4">
            {syncHistory.slice(0, 3).map((item) => (
              <Card
                key={item.id}
                className="bg-[#282828] border-transparent p-3 sm:p-4 hover:bg-[#3e3e3e] transition-colors"
              >
                <div className="flex items-center gap-3 sm:gap-4">
                  <div
                    className={`w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                      item.status === "success"
                        ? "bg-[rgba(29,185,84,0.2)] text-[#1DB954]"
                        : "bg-[rgba(226,33,52,0.2)] text-[#e22134]"
                    }`}
                  >
                    {item.status === "success" ? (
                      <Check className="w-3 h-3 sm:w-4 sm:h-4" />
                    ) : (
                      <AlertCircle className="w-3 h-3 sm:w-4 sm:h-4" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-white font-semibold text-sm sm:text-base">{item.message}</div>
                    <div className="text-[#b3b3b3] text-xs sm:text-sm">
                      {item.status === "success"
                        ? `${item.playlistCount} playlists synced • ${item.songCount} songs transferred`
                        : "Connection timeout • Retry available"}
                    </div>
                  </div>
                  <div className="text-[#a7a7a7] text-xs sm:text-sm font-medium flex-shrink-0">
                    {formatTimeAgo(item.timestamp)}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}
