
<<<<<<-- cut here -->>>>>>

  nock('https://accounts.google.com:443')
  .post('/o/oauth2/token')
  .reply(
    200,
    {
      "access_token": "dummyToken",
      "expires_in": 3600,
      "refresh_token": "dummyToken",
      "token_type": "Bearer"
    },
    [
      'Content-Type',
      'application/json; charset=utf-8',
      'X-Content-Type-Options',
      'nosniff',
      'Cache-Control',
      'no-cache, no-store, max-age=0, must-revalidate',
      'Pragma',
      'no-cache',
      'Expires',
      'Mon, 01 Jan 1990 00:00:00 GMT',
      'Date',
      'Thu, 19 Jan 2017 22:14:08 GMT',
      'Content-Disposition',
      'attachment; filename="json.txt"; filename*=UTF-8\'\'json.txt',
      'Server',
      'ESF',
      'X-XSS-Protection',
      '1; mode=block',
      'X-Frame-Options',
      'SAMEORIGIN',
      'Alt-Svc',
      'quic=":443"; ma=2592000; v="35,34"',
      'Accept-Ranges',
      'none',
      'Vary',
      'Accept-Encoding',
      'Connection',
      'close'
    ]
  )

<<<<<<-- cut here -->>>>>>
