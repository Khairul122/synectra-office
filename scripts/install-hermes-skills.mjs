// Salin skill kantor dari repo (hermes/skills) ke profil Hermes `synectra-office`.
// Target: HERMES_SKILLS_DIR, atau %LOCALAPPDATA%/hermes/profiles/synectra-office/skills.
import { cpSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const source = resolve(import.meta.dirname, '../hermes/skills');
const profileSkills = process.env.HERMES_SKILLS_DIR
  ?? join(process.env.LOCALAPPDATA ?? join(process.env.HOME ?? '', '.local/share'), 'hermes/profiles/synectra-office/skills');

if (!existsSync(profileSkills)) {
  console.error(`Folder skill profil Hermes tidak ditemukan: ${profileSkills}\nSet HERMES_SKILLS_DIR ke folder skills profil synectra-office.`);
  process.exit(1);
}
const target = join(profileSkills, 'synectra-office');
cpSync(source, target, { recursive: true });
console.log(`Skill Synectra terpasang di ${target}`);
