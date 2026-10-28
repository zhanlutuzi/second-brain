import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.SECOND_BRAIN_HOME = mkdtempSync(join(tmpdir(), 'kb-home-'));
delete process.env.KB_VAULT;
delete process.env.FEISHU_APP_ID;
delete process.env.FEISHU_APP_SECRET;
