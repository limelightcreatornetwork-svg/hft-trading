import { NextResponse } from 'next/server';
import { getSwaggerSpec } from '@/lib/swagger';

/**
 * GET /api/docs
 * Returns the OpenAPI/Swagger specification as JSON
 */
export async function GET() {
  const spec = getSwaggerSpec();
  return NextResponse.json(spec);
}
