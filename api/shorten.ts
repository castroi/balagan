import { createService } from '../src/platform/shorteners/service.js';
import { handleShorten } from '../src/platform/shorten-server.js';

/**
 * Vercel function: makes the short link on the server, because browsers block
 * the app from reading the shortening service's answer (CORS). Created once
 * per warm instance, so the service's nonce is reused between requests.
 */
const service = createService();

export default {
  fetch(request: Request): Promise<Response> {
    return handleShorten(request, service);
  },
};
