import { type NextRequest, NextResponse } from "next/server"

const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET
const REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI || "http://localhost:3000/api/spotify/callback"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")

  console.log("[v0] Callback received - URL:", request.url)
  console.log("[v0] Callback params - code:", !!code, "state:", state, "error:", error)
  console.log("[v0] Environment - Client ID exists:", !!SPOTIFY_CLIENT_ID)
  console.log("[v0] Environment - Client Secret exists:", !!SPOTIFY_CLIENT_SECRET)
  console.log("[v0] Environment - Redirect URI:", REDIRECT_URI)

  if (error) {
    console.log("[v0] OAuth error received:", error)
    return NextResponse.redirect(new URL("/?error=access_denied", request.url))
  }

  if (!code || !state) {
    console.log("[v0] Missing required parameters - code:", !!code, "state:", !!state)
    return NextResponse.redirect(new URL("/?error=invalid_request", request.url))
  }

  try {
    // Extract account type from state
    const [, accountType] = state.split("_")
    console.log("[v0] Extracted account type:", accountType)

    // Exchange code for access token
    const tokenResponse = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString("base64")}`,
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
      }),
    })

    console.log("[v0] Token response status:", tokenResponse.status)

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text()
      console.log("[v0] Token exchange failed:", errorText)
      throw new Error("Failed to exchange code for token")
    }

    const tokens = await tokenResponse.json()
    console.log("[v0] Tokens received - access_token exists:", !!tokens.access_token)

    // Get user profile
    const profileResponse = await fetch("https://api.spotify.com/v1/me", {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
      },
    })

    const profile = await profileResponse.json()
    console.log("[v0] Profile received:", profile.display_name)

    const response = NextResponse.redirect(
      new URL(`/?connected=${accountType}&user=${encodeURIComponent(profile.display_name)}`, request.url),
    )

    // Set secure cookies with token data
    response.cookies.set(`spotify_${accountType}_token`, tokens.access_token, {
      httpOnly: false, // Allow frontend access
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: tokens.expires_in || 3600,
    })

    response.cookies.set(`spotify_${accountType}_refresh`, tokens.refresh_token || "", {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30, // 30 days
    })

    response.cookies.set(`spotify_${accountType}_user`, JSON.stringify(profile), {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: tokens.expires_in || 3600,
    })

    console.log("[v0] Cookies set for account type:", accountType)
    return response
  } catch (error) {
    console.error("[v0] Callback error:", error)
    return NextResponse.redirect(new URL("/?error=auth_failed", request.url))
  }
}
