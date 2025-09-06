import { type NextRequest, NextResponse } from "next/server"

const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET
const REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI || "http://localhost:3000/api/spotify/callback"

export async function POST(request: NextRequest) {
  try {
    const { accountType } = await request.json()

    console.log("[v0] Auth request - Client ID exists:", !!SPOTIFY_CLIENT_ID)
    console.log("[v0] Auth request - Redirect URI:", REDIRECT_URI)
    console.log("[v0] Auth request - Account type:", accountType)

    // Generate state parameter for security
    const state = Math.random().toString(36).substring(2, 15)

    // Spotify OAuth scopes needed for playlist management
    const scopes = [
      "playlist-read-private",
      "playlist-read-collaborative",
      "playlist-modify-public",
      "playlist-modify-private",
      "user-library-read",
      "user-library-modify",
    ].join(" ")

    const authUrl = new URL("https://accounts.spotify.com/authorize")
    authUrl.searchParams.append("response_type", "code")
    authUrl.searchParams.append("client_id", SPOTIFY_CLIENT_ID!)
    authUrl.searchParams.append("scope", scopes)
    authUrl.searchParams.append("redirect_uri", REDIRECT_URI)
    authUrl.searchParams.append("state", `${state}_${accountType}`)
    authUrl.searchParams.append("show_dialog", "true")

    console.log("[v0] Generated auth URL:", authUrl.toString())

    return NextResponse.json({
      authUrl: authUrl.toString(),
      state,
    })
  } catch (error) {
    console.error("Auth error:", error)
    return NextResponse.json({ error: "Failed to initiate authentication" }, { status: 500 })
  }
}
