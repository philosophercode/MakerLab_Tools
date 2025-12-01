import { Router, Request, Response } from 'express';
import * as https from 'https';
import * as http from 'http';

export function createImageRouter(): Router {
  const router = Router();

  /**
   * GET /api/image?url=IMAGE_URL
   * Proxy images to avoid CORS issues
   */
  router.get('/', (req: Request, res: Response) => {
    const imageUrl = req.query.url as string;

    if (!imageUrl) {
      return res.status(400).json({ error: 'Missing url parameter' });
    }

    try {
      const url = new URL(imageUrl);
      const client = url.protocol === 'https:' ? https : http;

      const followRedirect = (
        redirectUrl: string,
        depth: number = 0
      ) => {
        if (depth > 5) {
          if (!res.headersSent) {
            return res.status(500).json({ error: 'Too many redirects' });
          }
          return;
        }

        const redirectUrlObj = new URL(redirectUrl);
        const redirectClient =
          redirectUrlObj.protocol === 'https:' ? https : http;

        const redirectRequest = redirectClient.get(
          redirectUrl,
          {
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; MakerLab-ToolFinder/1.0)',
            },
          },
          (redirectResponse) => {
            // Handle nested redirects
            if (
              redirectResponse.statusCode === 301 ||
              redirectResponse.statusCode === 302 ||
              redirectResponse.statusCode === 303 ||
              redirectResponse.statusCode === 307 ||
              redirectResponse.statusCode === 308
            ) {
              const nextRedirectUrl = redirectResponse.headers.location;
              if (nextRedirectUrl) {
                // Consume the redirect response
                redirectResponse.resume();
                return followRedirect(nextRedirectUrl, depth + 1);
              }
            }

            // Check if headers have already been sent
            if (res.headersSent) {
              // If headers are already sent, just pipe the data
              redirectResponse.pipe(res);
              return;
            }

            // Set CORS headers
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET');
            res.setHeader('Cache-Control', 'public, max-age=31536000');

            // Forward content type
            if (redirectResponse.headers['content-type']) {
              res.setHeader(
                'Content-Type',
                redirectResponse.headers['content-type']
              );
            }

            // Stream the image
            redirectResponse.pipe(res);
          }
        );

        redirectRequest.on('error', (error) => {
          if (!res.headersSent) {
            console.error('Error fetching redirected image:', error);
            res.status(500).json({ error: 'Failed to fetch image' });
          }
        });

        redirectRequest.setTimeout(30000, () => {
          if (!res.headersSent) {
            redirectRequest.destroy();
            res.status(504).json({ error: 'Image request timeout' });
          }
        });
      };

      const request = client.get(
        url.toString(),
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; MakerLab-ToolFinder/1.0)',
          },
        },
        (response) => {
        // Handle redirects (Google Drive often returns 303)
        if (
          response.statusCode === 301 ||
          response.statusCode === 302 ||
          response.statusCode === 303 ||
          response.statusCode === 307 ||
          response.statusCode === 308
        ) {
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            // Consume the redirect response to prevent it from being processed
            response.resume();
            // Resolve relative URLs
            const absoluteRedirectUrl = redirectUrl.startsWith('http')
              ? redirectUrl
              : `${url.protocol}//${url.host}${redirectUrl}`;
            return followRedirect(absoluteRedirectUrl);
          }
        }

        // Check if headers have already been sent (from redirect)
        if (res.headersSent) {
          // If headers are already sent, just pipe the data
          response.pipe(res);
          return;
        }

        // Set CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET');
        res.setHeader('Cache-Control', 'public, max-age=31536000');

        // Forward content type
        if (response.headers['content-type']) {
          res.setHeader('Content-Type', response.headers['content-type']);
        }

        // Stream the image
        response.pipe(res);
      });

      request.on('error', (error) => {
        if (!res.headersSent) {
          console.error('Error fetching image:', error);
          res.status(500).json({ error: 'Failed to fetch image' });
        }
      });

      request.setTimeout(30000, () => {
        if (!res.headersSent) {
          request.destroy();
          res.status(504).json({ error: 'Image request timeout' });
        }
      });
    } catch (error) {
      console.error('Invalid image URL:', error);
      res.status(400).json({ error: 'Invalid image URL' });
    }
  });

  return router;
}

