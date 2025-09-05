import { type NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const account = searchParams.get("account")

  console.log(`[v0] Fetching playlists for account: ${account}`)

  try {
    // In a real app, you'd retrieve the stored access token for the specified account
    const accessToken = getStoredAccessToken(account!)

    if (!accessToken) {
      console.log(`[v0] No access token found for account: ${account}`)
      return NextResponse.json({ error: "Account not connected" }, { status: 401 })
    }

    console.log(`[v0] Access token found for ${account}, fetching playlists...`)

    // Fetch user's playlists
    const playlistsResponse = await fetch("https://api.spotify.com/v1/me/playlists?limit=50", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!playlistsResponse.ok) {
      console.error(`[v0] Playlists API error: ${playlistsResponse.status} ${playlistsResponse.statusText}`)
      throw new Error(`Failed to fetch playlists: ${playlistsResponse.status}`)
    }

    const playlistsData = await playlistsResponse.json()
    console.log(`[v0] Fetched ${playlistsData.items?.length || 0} regular playlists`)

    // Also fetch liked songs (saved tracks)
    console.log(`[v0] Fetching liked songs for ${account}...`)
    const likedSongsResponse = await fetch("https://api.spotify.com/v1/me/tracks?limit=1", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    let likedSongsCount = 0
    if (likedSongsResponse.ok) {
      const likedSongsData = await likedSongsResponse.json()
      likedSongsCount = likedSongsData.total || 0
      console.log(`[v0] Found ${likedSongsCount} liked songs`)
    } else {
      console.error(`[v0] Liked songs API error: ${likedSongsResponse.status} ${likedSongsResponse.statusText}`)
    }

    const allPlaylists = []

    if (likedSongsCount > 0) {
      allPlaylists.push({
        id: "liked_songs",
        name: "Liked Songs",
        tracks: { total: likedSongsCount },
        owner: { display_name: "You" },
        images: [],
        type: "liked_songs",
      })
    }

    allPlaylists.push(...(playlistsData.items || []))

    console.log(`[v0] Returning ${allPlaylists.length} total playlists (including Liked Songs if applicable)`)
    return NextResponse.json(allPlaylists)
  } catch (error) {
    console.error(`[v0] Playlists fetch error for ${account}:`, error)
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

    const tokenData = JSON.parse(decodeURIComponent(tokenCookie.value))
    console.log(`[v0] Retrieved token for account: ${account}`)
    return tokenData.access_token
  } catch (error) {
    console.error(`[v0] Error retrieving token for ${account}:`, error)
    return null
  }
}
