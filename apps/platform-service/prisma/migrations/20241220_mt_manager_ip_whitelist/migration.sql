-- AddColumn: api_key_allowed_ips to mt_managers
-- IP Whitelist support for MtManager API Key authentication

ALTER TABLE "mt_managers" ADD COLUMN "api_key_allowed_ips" TEXT[] DEFAULT ARRAY[]::TEXT[];
