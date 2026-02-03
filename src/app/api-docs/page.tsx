'use client';

import dynamic from 'next/dynamic';
import 'swagger-ui-react/swagger-ui.css';

// Dynamically import SwaggerUI to avoid SSR issues
const SwaggerUI = dynamic(() => import('swagger-ui-react'), { ssr: false });

export default function ApiDocsPage() {
  return (
    <div className="swagger-container">
      <style jsx global>{`
        body {
          margin: 0;
          padding: 0;
        }
        .swagger-container {
          min-height: 100vh;
        }
        /* Override Swagger UI styles for better appearance */
        .swagger-ui .topbar {
          display: none;
        }
        .swagger-ui .info {
          margin: 20px 0;
        }
        .swagger-ui .info .title {
          font-size: 2em;
        }
        .swagger-ui .scheme-container {
          background: #f5f5f5;
          padding: 15px;
        }
        .swagger-ui .opblock-tag {
          font-size: 1.2em;
        }
        .swagger-ui .opblock.opblock-get {
          border-color: #61affe;
          background: rgba(97, 175, 254, 0.1);
        }
        .swagger-ui .opblock.opblock-post {
          border-color: #49cc90;
          background: rgba(73, 204, 144, 0.1);
        }
        .swagger-ui .opblock.opblock-put {
          border-color: #fca130;
          background: rgba(252, 161, 48, 0.1);
        }
        .swagger-ui .opblock.opblock-delete {
          border-color: #f93e3e;
          background: rgba(249, 62, 62, 0.1);
        }
        .swagger-ui .opblock.opblock-patch {
          border-color: #50e3c2;
          background: rgba(80, 227, 194, 0.1);
        }
      `}</style>
      <SwaggerUI url="/api/openapi" />
    </div>
  );
}
