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
    return NextResponse.redirect(new URL(`/?error=oauth_error&details=${error}`, request.url))
  }

  if (!code || !state) {
    console.log("[v0] Missing required parameters - code:", !!code, "state:", !!state)
    return NextResponse.redirect(new URL("/?error=missing_params", request.url))
  }

  try {
    // Extract account type from state
    const [, accountType] = state.split("_")
    console.log("[v0] Extracted account type:", accountType)

    const tokenRequestBody = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
    })

    console.log("[v0] Token request body:", tokenRequestBody.toString())
    console.log("[v0] Using redirect URI for token exchange:", REDIRECT_URI)

    // Exchange code for access token
    const tokenResponse = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString("base64")}`,
      },
      body: tokenRequestBody,
    })

    console.log("[v0] Token response status:", tokenResponse.status)
    console.log("[v0] Token response headers:", Object.fromEntries(tokenResponse.headers.entries()))

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text()
      console.log("[v0] Token exchange failed with status:", tokenResponse.status)
      console.log("[v0] Token exchange error response:", errorText)

      return NextResponse.redirect(
        new URL(
          `/?error=token_exchange_failed&status=${tokenResponse.status}&details=${encodeURIComponent(errorText)}`,
          request.url,
        ),
      )
    }

    const tokens = await tokenResponse.json()
    console.log("[v0] Tokens received - access_token exists:", !!tokens.access_token)
    console.log("[v0] Token expires_in:", tokens.expires_in)

    // Get user profile
    const profileResponse = await fetch("https://api.spotify.com/v1/me", {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
      },
    })

    if (!profileResponse.ok) {
      const profileError = await profileResponse.text()
      console.log("[v0] Profile fetch failed with status:", profileResponse.status)
      console.log("[v0] Profile fetch error:", profileError)

      let errorMessage = "Failed to fetch user profile"
      if (profileResponse.status === 403) {
        errorMessage =
          "Your Spotify app is in Development Mode. Add your email to the app's user list in developer.spotify.com/dashboard, or submit your app for review to make it public."
      } else if (profileResponse.status === 401) {
        errorMessage = "Authentication failed. Please check your Spotify app credentials."
      } else {
        errorMessage = `Profile fetch failed (${profileResponse.status}): ${profileError}`
      }

      return NextResponse.redirect(
        new URL(`/?error=profile_fetch_failed&details=${encodeURIComponent(errorMessage)}`, request.url),
      )
    }

    const profile = await profileResponse.json()
    console.log("[v0] Profile received:", profile.display_name, profile.email)

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

    console.log("[v0] Cookies set successfully for account type:", accountType)
    console.log("[v0] Redirecting to homepage with success params")
    return response
  } catch (error) {
    console.error("[v0] Callback error:", error)
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.redirect(
      new URL(`/?error=callback_exception&details=${encodeURIComponent(errorMessage)}`, request.url),
    )
  }
}
