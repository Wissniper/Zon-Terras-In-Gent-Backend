// Test-only shim. The real `uuid` package ships pure ESM (uuid@14), which
// Jest can't parse without transforming node_modules. For tests we don't
// need the full `uuid` API surface — only `v4`, which is functionally
// identical to Node's built-in crypto.randomUUID().
import { randomUUID } from "node:crypto";

export const v4 = (): string => randomUUID();
export default { v4 };
