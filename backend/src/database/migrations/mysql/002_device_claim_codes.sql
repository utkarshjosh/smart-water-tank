-- Device claim codes: short-lived, single-use codes minted by a logged-in
-- user to pair a physical device with their tenant (see plans/first-launch-plan.md).

SET NAMES utf8mb4;

CREATE TABLE device_claim_codes (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    code_hash VARCHAR(255) NOT NULL, -- sha256 of the claim code, same pattern as device_tokens.token_hash
    tenant_id CHAR(36) NOT NULL,
    created_by_user_id CHAR(36),
    device_id CHAR(36), -- set once consumed
    expires_at DATETIME NOT NULL,
    consumed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_device_claim_codes_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_device_claim_codes_creator FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_device_claim_codes_device FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_device_claim_codes_hash ON device_claim_codes(code_hash);
CREATE INDEX idx_device_claim_codes_tenant ON device_claim_codes(tenant_id);
