/**
 * Single-table design. See backend/src/domain/keys.ts for the full entity map;
 * the three indexes below exist for exactly three access patterns:
 *
 *   gsi1  open loans for a branch, ordered by due date (dashboard)
 *   gsi2  exact lookups: member by phone, asset by label code, tenant registry
 *   gsi3  a member's loan and message history
 *
 * gsi1 is intentionally sparse. The handler removes gsi1pk/gsi1sk on check-in,
 * so the index holds only currently-borrowed items.
 */
resource "aws_dynamodb_table" "main" {
  name         = "${local.name_prefix}-data"
  billing_mode = var.dynamodb_billing_mode
  hash_key     = "PK"
  range_key    = "SK"

  # Only key and index attributes are declared; everything else is schemaless.
  attribute {
    name = "PK"
    type = "S"
  }

  attribute {
    name = "SK"
    type = "S"
  }

  attribute {
    name = "gsi1pk"
    type = "S"
  }

  attribute {
    name = "gsi1sk"
    type = "S"
  }

  attribute {
    name = "gsi2pk"
    type = "S"
  }

  attribute {
    name = "gsi2sk"
    type = "S"
  }

  attribute {
    name = "gsi3pk"
    type = "S"
  }

  attribute {
    name = "gsi3sk"
    type = "S"
  }

  global_secondary_index {
    name            = "gsi1"
    hash_key        = "gsi1pk"
    range_key       = "gsi1sk"
    projection_type = "ALL"
  }

  global_secondary_index {
    name            = "gsi2"
    hash_key        = "gsi2pk"
    range_key       = "gsi2sk"
    projection_type = "ALL"
  }

  global_secondary_index {
    name            = "gsi3"
    hash_key        = "gsi3pk"
    range_key       = "gsi3sk"
    projection_type = "ALL"
  }

  # Message logs carry an expiry so the table does not accumulate years of
  # delivery records; loans and catalogue items never set the attribute.
  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = var.point_in_time_recovery
  }

  server_side_encryption {
    enabled = true
  }

  deletion_protection_enabled = var.deletion_protection

  tags = {
    Name = "${local.name_prefix}-data"
  }
}
