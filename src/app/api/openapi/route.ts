import { NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';
import yaml from 'yaml';

// Disable caching - always serve fresh spec
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * GET /api/openapi
 * Serves the OpenAPI specification as JSON
 *
 * This endpoint is intentionally public (no authentication) to allow
 * API documentation access without requiring credentials.
 */

// Cache spec at module initialization (only runs once at startup)
let cachedSpec: Record<string, unknown> | null = null;

function loadSpec(): Record<string, unknown> {
  if (cachedSpec !== null) {
    return cachedSpec;
  }
  const yamlPath = join(process.cwd(), 'openapi.yaml');
  const yamlContent = readFileSync(yamlPath, 'utf-8');
  const parsed = yaml.parse(yamlContent) as Record<string, unknown>;
  cachedSpec = parsed;
  return parsed;
}

export async function GET() {
  try {
    const spec = loadSpec();

    return NextResponse.json(spec, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
      },
    });
  } catch (error) {
    console.error('Error serving OpenAPI spec:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to load OpenAPI specification',
      },
      { status: 500 }
    );
  }
}
