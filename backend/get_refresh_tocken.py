from google_auth_oauthlib.flow import InstalledAppFlow

flow = InstalledAppFlow.from_client_secrets_file(
    "credentials.json",  # Download from Google Cloud Console
    scopes=["https://www.googleapis.com/auth/calendar"]
)
creds = flow.run_local_server(port=3000)
print("Refresh token:", creds.refresh_token)
