create table if not exists app_settings (
  key text primary key,
  value text not null,
  created_at timestamptz not null default now()
);

create table if not exists orders (
  id uuid primary key,
  proposal_nonce text not null unique,
  product_id text not null,
  quantity integer not null,
  amount_cents integer not null,
  currency text not null default 'USD',
  mode text not null,
  status text not null,
  paypal_order_id text unique,
  paypal_capture_id text,
  webhook_verified boolean not null default false,
  last_event_type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists webhook_events (
  transmission_id text primary key,
  event_id text not null,
  event_type text not null,
  resource_id text,
  received_at timestamptz not null default now()
);

create index if not exists webhook_events_event_id on webhook_events (event_id);
