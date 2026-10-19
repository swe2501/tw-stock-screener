# EAS archive boundary

Root .easignore permits only apps/mobile and packages/shared; excludes backend, scripts, data, web, env files, native/generated output and signing credentials. EAS starts its archive from the Git root even when invoked inside apps/mobile. This setting does not change Vercel deployments or old web/App API behavior.

Validate using eas build:inspect --platform android --stage archive --profile preview and inspect actual file paths before cloud upload. No signing credential creation, schema change, paid plan or store publication is authorized by this file. Rollback: restore .easignore only if the replacement archive has been reviewed.
