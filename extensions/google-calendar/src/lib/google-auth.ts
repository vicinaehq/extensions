import { getPreferenceValues, LocalStorage, showToast, Toast } from "@vicinae/api";
import { OAuth2Client } from "google-auth-library";
import { AuthTokens, Preferences } from "../types";

/**
 * Google OAuth scopes required for calendar access
 */
const SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/userinfo.email",
];

/**
 * LocalStorage key for cached access tokens
 */
const TOKENS_STORAGE_KEY = "google-calendar-auth-tokens";

/**
 * Threshold for proactive token refresh (5 minutes before expiry)
 */
const REFRESH_THRESHOLD_MS = 5 * 60 * 1000;

/**
 * GoogleAuth class handles OAuth authentication and token management
 *
 * Design Note: This class is intentionally isolated to facilitate future migration
 * when Vicinae adds native OAuth support (similar to Raycast's OAuthService.google()).
 * When that happens, only this file needs to be updated - the rest of the codebase
 * can remain unchanged.
 */
export class GoogleAuth {
  private oauth2Client: OAuth2Client | null = null;
  private preferences: Preferences;

  constructor() {
    this.preferences = getPreferenceValues<Preferences>();
  }

  /**
   * Validate preferences are configured
   */
  private validatePreferences(): void {
    if (!this.preferences.clientId || !this.preferences.clientSecret || !this.preferences.refreshToken) {
      throw new Error(
        "OAuth credentials not configured. Please set Client ID, Client Secret, and Refresh Token in extension preferences. See README.md for setup instructions."
      );
    }
  }

  /**
   * Initialize OAuth2 client and load/refresh tokens
   */
  async initialize(): Promise<OAuth2Client> {
    // Validate preferences first
    this.validatePreferences();

    // Create OAuth2 client
    this.oauth2Client = new OAuth2Client(
      this.preferences.clientId,
      this.preferences.clientSecret,
      "http://localhost:8080" // Redirect URI (not actively used in manual flow)
    );

    // Try to load cached tokens first
    const cachedTokens = await this.loadCachedTokens();

    if (cachedTokens) {
      // Use cached tokens
      this.oauth2Client.setCredentials({
        access_token: cachedTokens.accessToken,
        refresh_token: cachedTokens.refreshToken,
        expiry_date: cachedTokens.expiryDate,
      });

      // Check if token needs refresh
      if (this.shouldRefreshToken(cachedTokens.expiryDate)) {
        await this.refreshAccessToken();
      }
    } else {
      // No cached tokens, use refresh token from preferences
      this.oauth2Client.setCredentials({
        refresh_token: this.preferences.refreshToken,
      });

      // Get initial access token
      try {
        await this.refreshAccessToken();
      } catch (error) {
        await showToast({
          style: Toast.Style.Failure,
          title: "Authentication Failed",
          message: "Invalid OAuth credentials. Please check your settings.",
        });
        throw new Error("Failed to authenticate with Google Calendar. Please verify your OAuth credentials in preferences.");
      }
    }

    return this.oauth2Client;
  }

  /**
   * Get the authenticated OAuth2 client
   */
  async getAuthClient(): Promise<OAuth2Client> {
    if (!this.oauth2Client) {
      return await this.initialize();
    }

    // Check if token needs refresh before returning
    const credentials = this.oauth2Client.credentials;
    if (credentials.expiry_date && this.shouldRefreshToken(credentials.expiry_date)) {
      await this.refreshAccessToken();
    }

    return this.oauth2Client;
  }

  /**
   * Check if token should be refreshed
   */
  private shouldRefreshToken(expiryDate: number): boolean {
    const now = Date.now();
    return now >= expiryDate - REFRESH_THRESHOLD_MS;
  }

  /**
   * Refresh the access token using the refresh token
   */
  private async refreshAccessToken(): Promise<void> {
    if (!this.oauth2Client) {
      throw new Error("OAuth2 client not initialized");
    }

    try {
      const { credentials } = await this.oauth2Client.refreshAccessToken();

      // Update client credentials
      this.oauth2Client.setCredentials(credentials);

      // Cache the new tokens
      if (credentials.access_token && credentials.refresh_token && credentials.expiry_date) {
        await this.cacheTokens({
          accessToken: credentials.access_token,
          refreshToken: credentials.refresh_token,
          expiryDate: credentials.expiry_date,
        });
      }
    } catch (error) {
      console.error("Failed to refresh access token:", error);
      await showToast({
        style: Toast.Style.Failure,
        title: "Token Refresh Failed",
        message: "Unable to refresh access token. Please re-authenticate.",
      });
      throw error;
    }
  }

  /**
   * Load cached tokens from LocalStorage
   */
  private async loadCachedTokens(): Promise<AuthTokens | null> {
    try {
      const cached = await LocalStorage.getItem(TOKENS_STORAGE_KEY);
      if (!cached) {
        return null;
      }

      const tokens = JSON.parse(cached as string) as AuthTokens;

      // Validate token structure
      if (!tokens.accessToken || !tokens.refreshToken || !tokens.expiryDate) {
        return null;
      }

      return tokens;
    } catch (error) {
      console.error("Failed to load cached tokens:", error);
      return null;
    }
  }

  /**
   * Cache tokens to LocalStorage
   */
  private async cacheTokens(tokens: AuthTokens): Promise<void> {
    try {
      await LocalStorage.setItem(TOKENS_STORAGE_KEY, JSON.stringify(tokens));
    } catch (error) {
      console.error("Failed to cache tokens:", error);
    }
  }

  /**
   * Clear cached tokens (for logout/re-authentication)
   */
  async clearTokens(): Promise<void> {
    try {
      await LocalStorage.removeItem(TOKENS_STORAGE_KEY);
      this.oauth2Client = null;
    } catch (error) {
      console.error("Failed to clear tokens:", error);
    }
  }

  /**
   * Generate OAuth authorization URL for manual setup
   * This is a utility function to help users during initial setup
   */
  static generateAuthUrl(clientId: string, clientSecret: string): string {
    const oauth2Client = new OAuth2Client(
      clientId,
      clientSecret,
      "http://localhost:8080"
    );

    return oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: SCOPES,
      prompt: "consent", // Force consent screen to get refresh token
    });
  }
}

/**
 * Singleton instance of GoogleAuth
 *
 * Usage in other files:
 *   const authClient = await googleAuth.getAuthClient();
 *   const calendar = google.calendar({ version: 'v3', auth: authClient });
 */
export const googleAuth = new GoogleAuth();
