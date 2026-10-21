import SwaggerParser from '@apidevtools/swagger-parser';
import { fileURLToPath } from 'node:url';

try {
  const specification = await SwaggerParser.validate(
    fileURLToPath(new URL('../openapi.yaml', import.meta.url)),
    { resolve: { external: false } },
  );
  console.log(`PASS: OpenAPI ${specification.openapi}; ${Object.keys(specification.paths).length} documented paths validated.`);
} catch (error) {
  console.error(`FAIL: OpenAPI validation: ${error.message}`);
  process.exitCode = 1;
}
