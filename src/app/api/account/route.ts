import { getAccount } from '@/lib/alpaca';
import { formatAlpacaAccount } from '@/lib/formatters';
import { apiHandler, apiSuccess } from '@/lib/api-helpers';

// Disable caching - always fetch fresh data
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const GET = apiHandler(async function GET(_request) {
  const account = await getAccount();
  return apiSuccess(formatAlpacaAccount(account));
});
