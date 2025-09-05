import { type NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const account = searchParams.get("account")

  try {
    // In a real app, you'd retrieve the stored access token for the specified account
    const accessToken = getStoredAccessToken(account!)

    if (!accessToken) {
      return NextResponse.json({ error: "Account not connected" }, { status: 401 })
    }

    // Fetch user's playlists
    const playlistsResponse = await fetch("https://api.spotify.com/v1/me/playlists?limit=50", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!playlistsResponse.ok) {
      throw new Error("Failed to fetch playlists")
    }

    const playlistsData = await playlistsResponse.json()

    // Also fetch liked songs (saved tracks)
    const likedSongsResponse = await fetch("https://api.spotify.com/v1/me/tracks?limit=1", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    const likedSongsData = await likedSongsResponse.json()

    // Combine playlists with liked songs
    const allPlaylists = [
      {
        id: "liked_songs",
        name: "Liked Songs",
        tracks: { total: likedSongsData.total },
        owner: { display_name: "You" },
        images: [],
        type: "liked_songs",
      },
      ...playlistsData.items,
    ]

    return NextResponse.json(allPlaylists)
  } catch (error) {
    console.error("Playlists fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch playlists" }, { status: 500 })
  }
}

function getStoredAccessToken(account: string): string | null {
  try {
    const cookieName = `spotify_${account}_token`
    const tokenCookie = cookies().get(cookieName)

    if (!tokenCookie?.value) {
      console.log(`[v0] No token found for account: ${account}`)
      return null
    }

    const token = decodeURIComponent(tokenCookie.value)
    console.log(`[v0] Retrieved token for account: ${account}`)
    return token
  } catch (error) {
    console.error(`[v0] Error retrieving token for ${account}:`, error)
    return null
  }
}
