import { type NextRequest, NextResponse } from "next/server"

interface SyncRequest {
  selectedPlaylists: string[]
  selectedSecondaryPlaylists: string[]
  syncDirection: "one-way" | "two-way"
  syncFrequency: string
}

export async function POST(request: NextRequest) {
  try {
    const { selectedPlaylists, selectedSecondaryPlaylists, syncDirection, syncFrequency }: SyncRequest =
      await request.json()

    const primaryToken = getStoredAccessToken("primary", request)
    const secondaryToken = getStoredAccessToken("secondary", request)

    if (!primaryToken || !secondaryToken) {
      return NextResponse.json({ error: "Both accounts must be connected" }, { status: 400 })
    }

    let totalSongsSynced = 0

    const allSelectedPlaylists = [...selectedPlaylists, ...selectedSecondaryPlaylists]

    for (const playlistId of allSelectedPlaylists) {
      if (playlistId === "liked_songs") {
        // Handle liked songs sync
        totalSongsSynced += await syncLikedSongs(primaryToken, secondaryToken, syncDirection)
      } else {
        // Handle regular playlist sync
        totalSongsSynced += await syncPlaylist(playlistId, primaryToken, secondaryToken, syncDirection)
      }
    }

    // Log sync activity (in a real app, store in database)
    console.log(`Sync completed: ${allSelectedPlaylists.length} playlists, ${totalSongsSynced} songs`)

    return NextResponse.json({
      success: true,
      playlistCount: allSelectedPlaylists.length,
      songCount: totalSongsSynced,
      totalSongs: totalSongsSynced,
      message: "Sync completed successfully",
    })
  } catch (error) {
    console.error("Sync error:", error)
    return NextResponse.json({ error: "Sync failed" }, { status: 500 })
  }
}

async function syncLikedSongs(primaryToken: string, secondaryToken: string, direction: string): Promise<number> {
  try {
    // Get liked songs from primary account
    const likedSongsResponse = await fetch("https://api.spotify.com/v1/me/tracks?limit=50", {
      headers: { Authorization: `Bearer ${primaryToken}` },
    })

    const likedSongs = await likedSongsResponse.json()

    if (direction === "one-way") {
      // Add songs to secondary account's liked songs
      const trackIds = likedSongs.items.map((item: any) => item.track.id)

      if (trackIds.length > 0) {
        await fetch("https://api.spotify.com/v1/me/tracks", {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${secondaryToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ids: trackIds }),
        })
      }

      return trackIds.length
    }

    // For two-way sync, implement bidirectional logic here
    return 0
  } catch (error) {
    console.error("Liked songs sync error:", error)
    return 0
  }
}

async function syncPlaylist(
  playlistId: string,
  primaryToken: string,
  secondaryToken: string,
  direction: string,
): Promise<number> {
  try {
    // Get playlist details and tracks from primary account
    const [playlistResponse, tracksResponse] = await Promise.all([
      fetch(`https://api.spotify.com/v1/playlists/${playlistId}`, {
        headers: { Authorization: `Bearer ${primaryToken}` },
      }),
      fetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
        headers: { Authorization: `Bearer ${primaryToken}` },
      }),
    ])

    const playlist = await playlistResponse.json()
    const tracks = await tracksResponse.json()

    if (direction === "one-way") {
      // Create or update playlist in secondary account
      const createPlaylistResponse = await fetch("https://api.spotify.com/v1/me/playlists", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secondaryToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: playlist.name,
          description: `Synced from primary account - ${playlist.description || ""}`,
          public: false,
        }),
      })

      const newPlaylist = await createPlaylistResponse.json()

      // Add tracks to the new playlist
      const trackUris = tracks.items
        .filter((item: any) => item.track && item.track.uri)
        .map((item: any) => item.track.uri)

      if (trackUris.length > 0) {
        await fetch(`https://api.spotify.com/v1/playlists/${newPlaylist.id}/tracks`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${secondaryToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ uris: trackUris }),
        })
      }

      return trackUris.length
    }

    // For two-way sync, implement bidirectional logic here
    return 0
  } catch (error) {
    console.error("Playlist sync error:", error)
    return 0
  }
}

function getStoredAccessToken(account: string, request: NextRequest): string | null {
  try {
    const cookieName = `spotify_${account}_token`
    const tokenCookie = request.cookies.get(cookieName)

    if (!tokenCookie) {
      return null
    }

    // Return the token directly as it's stored as a plain string
    return decodeURIComponent(tokenCookie.value)
  } catch (error) {
    console.error(`Failed to retrieve ${account} token:`, error)
    return null
  }
}
