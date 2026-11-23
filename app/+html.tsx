import { ScrollViewStyleReset } from 'expo-router/html'
import type { PropsWithChildren } from 'react'

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en" style={{ backgroundColor: '#000000', colorScheme: 'dark' }}>
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"
        />
        <meta name="theme-color" content="#000000" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Lull" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="icon" type="image/png" href="/favicon.png" />
        <link rel="apple-touch-icon" href="/favicon.png" />
        <title>Lull</title>
        <ScrollViewStyleReset />
        <style
          dangerouslySetInnerHTML={{
            __html: `
              html, body, #root {
                background-color: #000000 !important;
                color: #DCE0E6;
                height: 100%;
                margin: 0;
                padding: 0;
                overscroll-behavior: none;
                -webkit-tap-highlight-color: transparent;
                user-select: none;
                -webkit-user-select: none;
              }
            `,
          }}
        />
      </head>
      <body style={{ backgroundColor: '#000000' }}>{children}</body>
    </html>
  )
}
