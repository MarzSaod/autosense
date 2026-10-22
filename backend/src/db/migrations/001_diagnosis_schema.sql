CREATE TABLE IF NOT EXISTS diagnostic_codes (
  id serial PRIMARY KEY,
  code varchar NOT NULL UNIQUE,
  description text NOT NULL,
  system varchar,
  common_causes text,
  typical_repair text,
  est_cost_min numeric NOT NULL,
  est_cost_max numeric NOT NULL,
  est_time_min_hours numeric NOT NULL,
  est_time_max_hours numeric NOT NULL,
  suggested_service_id integer,
  created_at timestamp NOT NULL DEFAULT now(),
  search_vector tsvector GENERATED ALWAYS AS (
    to_tsvector(
      'english',
      coalesce(code, '') || ' ' || coalesce(description, '') || ' ' || coalesce(common_causes, '')
    )
  ) STORED
);

CREATE INDEX IF NOT EXISTS diagnostic_codes_search_vector_idx
  ON diagnostic_codes USING GIN (search_vector);

CREATE TABLE IF NOT EXISTS diagnosis_requests (
  id serial PRIMARY KEY,
  customer_description text NOT NULL,
  ai_diagnosis_summary text,
  est_cost_min numeric,
  est_cost_max numeric,
  est_time_min_hours numeric,
  est_time_max_hours numeric,
  status varchar NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'converted_to_booking', 'dismissed')),
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS diagnosis_request_codes (
  id serial PRIMARY KEY,
  diagnosis_request_id integer NOT NULL REFERENCES diagnosis_requests(id),
  diagnostic_code_id integer NOT NULL REFERENCES diagnostic_codes(id),
  relevance_rank integer NOT NULL
);
