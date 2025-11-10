# OTP

Manage 2FA/OTP codes securely using LocalStorage.

## Features

- **Secure Storage**: OTP secrets and metadata are stored securely in LocalStorage
- **TOTP Support**: Generate time-based one-time passwords
- **HOTP Support**: Generate counter-based one-time passwords with automatic counter increment
- **URL Import**: Quick account setup from `otpauth://` URLs (QR codes)
- **QR Code Display**: Generate QR codes for accounts to easily share with other devices

## Requirements

- Vicinae extension environment with LocalStorage support

## Usage

1. **Add Account**: Use "Add 2FA Account" to store a new OTP secret
   - **URL Import**: Paste an `otpauth://` URL to auto-fill all fields
   - **Manual Entry**: Fill in account name, secret, and select TOTP/HOTP type
2. **View Codes**: Use "2FA Codes" to see current codes for all accounts
    - TOTP codes show countdown timer and auto-refresh every second
    - HOTP codes show current counter value
    - **QR Code**: Click "Show QR Code" to display a scannable QR code for any account

## URL Format Support

The extension supports standard `otpauth://` URLs, commonly found in QR codes:

```
otpauth://totp/GitHub:user@example.com?secret=JBSWY3DPEHPK3PXP&issuer=GitHub
otpauth://hotp/Example:alice@google.com?secret=JBSWY3DPEHPK3PXP&counter=5&digits=8
```

Supported parameters:
- `secret`: Base32-encoded secret key (required)
- `issuer`: Service provider name (optional)
- `digits`: Number of digits (6 or 8, default: 6)
- `period`: Time step in seconds for TOTP (default: 30)
- `counter`: Initial counter for HOTP (default: 0)
- `algorithm`: Hash algorithm (SHA1, SHA256, SHA512, default: SHA1)

## Security

OTP secrets are stored locally in Vicinae's LocalStorage. Data is encrypted at rest by Vicinae's security mechanisms.