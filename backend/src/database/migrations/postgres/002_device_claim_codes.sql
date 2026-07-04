-- Device claim codes: short-lived, single-use codes minted by a logged-in
-- user to pair a physical device with their tenant (see plans/first-launch-plan.md).

CREATE TABLE device_claim_codes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code_hash VARCHAR(255) NOT NULL, -- sha256 of the claim code, same pattern as device_tokens.token_hash
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    device_id UUID REFERENCES devices(id) ON DELETE SET NULL, -- set once consumed
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    consumed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_device_claim_codes_hash ON device_claim_codes(code_hash);
CREATE INDEX idx_device_claim_codes_tenant ON device_claim_codes(tenant_id);
