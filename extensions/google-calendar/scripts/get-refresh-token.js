#!/usr/bin/env node

/**
 * OAuth Refresh Token Helper Script
 *
 * This script helps users obtain a refresh token for Google Calendar OAuth.
 * It starts a local web server, opens the browser for OAuth authorization,
 * and extracts the refresh token from the callback.
 *
 * Usage:
 *   node scripts/get-refresh-token.js
 *
 * Requirements:
 *   - Google Cloud Console project with OAuth 2.0 credentials
 *   - Authorized redirect URI: http://localhost:8080
 */

const http = require('http');
const { URL } = require('url');
const { OAuth2Client } = require('google-auth-library');
const readline = require('readline');

// OAuth configuration
const REDIRECT_URI = 'http://localhost:8080';
const PORT = 8080;

const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/userinfo.email',
];

/**
 * Prompt user for input
 */
function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Open URL in browser (cross-platform)
 */
function openBrowser(url) {
  const start =
    process.platform === 'darwin'
      ? 'open'
      : process.platform === 'win32'
      ? 'start'
      : 'xdg-open';

  require('child_process').exec(`${start} "${url}"`);
}

/**
 * Main OAuth flow
 */
async function main() {
  console.log('\n🔐 Google Calendar OAuth Token Generator\n');
  console.log('This script will help you obtain a refresh token for the Google Calendar extension.\n');

  // Get Client ID and Secret
  const clientId = await prompt('Enter your OAuth Client ID: ');
  if (!clientId) {
    console.error('❌ Client ID is required');
    process.exit(1);
  }

  const clientSecret = await prompt('Enter your OAuth Client Secret: ');
  if (!clientSecret) {
    console.error('❌ Client Secret is required');
    process.exit(1);
  }

  // Create OAuth2 client
  const oauth2Client = new OAuth2Client(clientId, clientSecret, REDIRECT_URI);

  // Generate auth URL
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent', // Force consent to get refresh token
  });

  console.log('\n📋 Step 1: Opening browser for authorization...\n');
  console.log('If the browser doesn\'t open automatically, visit this URL:');
  console.log(`\n${authUrl}\n`);

  // Start local server to catch the callback
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, REDIRECT_URI);

      if (url.pathname === '/') {
        const code = url.searchParams.get('code');
        const error = url.searchParams.get('error');

        if (error) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <body style="font-family: sans-serif; padding: 40px; text-align: center;">
                <h1>❌ Authorization Failed</h1>
                <p>Error: ${error}</p>
                <p>You can close this window and try again.</p>
              </body>
            </html>
          `);
          server.close();
          process.exit(1);
        }

        if (!code) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <body style="font-family: sans-serif; padding: 40px; text-align: center;">
                <h1>❌ No Authorization Code</h1>
                <p>No authorization code received. Please try again.</p>
              </body>
            </html>
          `);
          return;
        }

        console.log('✅ Authorization code received, exchanging for tokens...\n');

        // Exchange code for tokens
        const { tokens } = await oauth2Client.getToken(code);

        // Send success response
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <html>
            <body style="font-family: sans-serif; padding: 40px; text-align: center;">
              <h1>✅ Authorization Successful!</h1>
              <p>You can close this window and return to your terminal.</p>
              <p style="color: #666; font-size: 14px; margin-top: 40px;">
                The refresh token has been displayed in your terminal.
              </p>
            </body>
          </html>
        `);

        // Display tokens
        console.log('🎉 Success! Here are your credentials:\n');
        console.log('─────────────────────────────────────────────────────────');
        console.log('Copy these values into your Vicinae extension preferences:');
        console.log('─────────────────────────────────────────────────────────\n');
        console.log(`OAuth Client ID:     ${clientId}`);
        console.log(`OAuth Client Secret: ${clientSecret}`);
        console.log(`Refresh Token:       ${tokens.refresh_token}\n`);
        console.log('─────────────────────────────────────────────────────────\n');

        if (!tokens.refresh_token) {
          console.warn('⚠️  Warning: No refresh token received.');
          console.warn('This might happen if you\'ve authorized this app before.');
          console.warn('Try revoking access at https://myaccount.google.com/permissions');
          console.warn('and run this script again.\n');
        }

        // Close server
        setTimeout(() => {
          server.close();
          process.exit(0);
        }, 1000);
      }
    } catch (error) {
      console.error('❌ Error processing callback:', error.message);
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal server error');
      server.close();
      process.exit(1);
    }
  });

  // Start server
  server.listen(PORT, () => {
    console.log(`🌐 Local server started on ${REDIRECT_URI}\n`);
    console.log('Waiting for authorization...\n');

    // Open browser
    openBrowser(authUrl);
  });

  // Handle server errors
  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`❌ Port ${PORT} is already in use.`);
      console.error('Please close any other applications using this port and try again.');
    } else {
      console.error('❌ Server error:', error.message);
    }
    process.exit(1);
  });
}

// Run the script
main().catch((error) => {
  console.error('❌ Unexpected error:', error.message);
  process.exit(1);
});
