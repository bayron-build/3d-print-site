-- Bambu filament color palette for fixed-price catalog orders. One row per
-- color; `available` = owner has the spool in house. Unavailable colors stay
-- orderable (longer lead time), so anon reads ALL rows — availability is a
-- label, not a filter.
-- Run once by the OWNER in the Supabase web SQL editor (same workflow as
-- 0001-0007). Purely additive: safe to run before the code that uses it
-- deploys; the current app never touches this table.

create table public.filament_colors (
  id text primary key,
  line text not null check (line in ('basic', 'matte')),
  name text not null,
  hex text not null,
  sort_order integer not null,
  available boolean not null default false
);

alter table public.filament_colors enable row level security;

create policy "Admin full access" on public.filament_colors
  for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "Anon read colors" on public.filament_colors
  for select to anon, authenticated
  using (true);

-- Seed: official Bambu PLA Basic lineup. All colors start unavailable; the
-- owner flips the in-house ones on /admin/kleuren.
insert into public.filament_colors (id, line, name, hex, sort_order) values
  ('basic-jade-white',       'basic', 'Jade White',       '#FFFFFF', 10),
  ('basic-beige',            'basic', 'Beige',            '#F7E6DE', 20),
  ('basic-gold',             'basic', 'Gold',             '#E4BD68', 30),
  ('basic-silver',           'basic', 'Silver',           '#A6A9AA', 40),
  ('basic-gray',             'basic', 'Gray',             '#8E9089', 50),
  ('basic-bronze',           'basic', 'Bronze',           '#847D48', 60),
  ('basic-brown',            'basic', 'Brown',            '#9D432C', 70),
  ('basic-cocoa-brown',      'basic', 'Cocoa Brown',      '#6F5034', 80),
  ('basic-maroon-red',       'basic', 'Maroon Red',       '#9D2235', 90),
  ('basic-red',              'basic', 'Red',              '#C12E1F', 100),
  ('basic-magenta',          'basic', 'Magenta',          '#EC008C', 110),
  ('basic-pink',             'basic', 'Pink',             '#F55A74', 120),
  ('basic-hot-pink',         'basic', 'Hot Pink',         '#F5547C', 130),
  ('basic-orange',           'basic', 'Orange',           '#FF6A13', 140),
  ('basic-pumpkin-orange',   'basic', 'Pumpkin Orange',   '#FF9016', 150),
  ('basic-sunflower-yellow', 'basic', 'Sunflower Yellow', '#FEC600', 160),
  ('basic-yellow',           'basic', 'Yellow',           '#F4EE2A', 170),
  ('basic-bright-green',     'basic', 'Bright Green',     '#BECF00', 180),
  ('basic-bambu-green',      'basic', 'Bambu Green',      '#00AE42', 190),
  ('basic-mistletoe-green',  'basic', 'Mistletoe Green',  '#3F8E43', 200),
  ('basic-turquoise',        'basic', 'Turquoise',        '#00B1B7', 210),
  ('basic-cyan',             'basic', 'Cyan',             '#0086D6', 220),
  ('basic-blue',             'basic', 'Blue',             '#0A2989', 230),
  ('basic-cobalt-blue',      'basic', 'Cobalt Blue',      '#0056B8', 240),
  ('basic-purple',           'basic', 'Purple',           '#5E43B7', 250),
  ('basic-indigo-purple',    'basic', 'Indigo Purple',    '#482960', 260),
  ('basic-blue-gray',        'basic', 'Blue Gray',        '#5B6579', 270),
  ('basic-light-gray',       'basic', 'Light Gray',       '#D1D3D5', 280),
  ('basic-dark-gray',        'basic', 'Dark Gray',        '#545454', 290),
  ('basic-black',            'basic', 'Black',            '#000000', 300);

-- Seed: official Bambu PLA Matte lineup.
insert into public.filament_colors (id, line, name, hex, sort_order) values
  ('matte-ivory-white',     'matte', 'Ivory White',     '#FFFFFF', 10),
  ('matte-bone-white',      'matte', 'Bone White',      '#CBC6B8', 20),
  ('matte-desert-tan',      'matte', 'Desert Tan',      '#E8DBB7', 30),
  ('matte-latte-brown',     'matte', 'Latte Brown',     '#D3B7A7', 40),
  ('matte-caramel',         'matte', 'Caramel',         '#AE835B', 50),
  ('matte-terracotta',      'matte', 'Terracotta',      '#B15533', 60),
  ('matte-dark-brown',      'matte', 'Dark Brown',      '#7D6556', 70),
  ('matte-dark-chocolate',  'matte', 'Dark Chocolate',  '#4D3324', 80),
  ('matte-lemon-yellow',    'matte', 'Lemon Yellow',    '#F7D959', 90),
  ('matte-mandarin-orange', 'matte', 'Mandarin Orange', '#F99963', 100),
  ('matte-sakura-pink',     'matte', 'Sakura Pink',     '#E8AFCF', 110),
  ('matte-lilac-purple',    'matte', 'Lilac Purple',    '#AE96D4', 120),
  ('matte-plum',            'matte', 'Plum',            '#950051', 130),
  ('matte-scarlet-red',     'matte', 'Scarlet Red',     '#DE4343', 140),
  ('matte-dark-red',        'matte', 'Dark Red',        '#BB3D43', 150),
  ('matte-apple-green',     'matte', 'Apple Green',     '#C2E189', 160),
  ('matte-grass-green',     'matte', 'Grass Green',     '#61C680', 170),
  ('matte-dark-green',      'matte', 'Dark Green',      '#68724D', 180),
  ('matte-ice-blue',        'matte', 'Ice Blue',        '#A3D8E1', 190),
  ('matte-sky-blue',        'matte', 'Sky Blue',        '#56B7E6', 200),
  ('matte-marine-blue',     'matte', 'Marine Blue',     '#0078BF', 210),
  ('matte-dark-blue',       'matte', 'Dark Blue',       '#042F56', 220),
  ('matte-ash-gray',        'matte', 'Ash Gray',        '#9B9EA0', 230),
  ('matte-nardo-gray',      'matte', 'Nardo Gray',      '#757575', 240),
  ('matte-charcoal',        'matte', 'Charcoal',        '#000000', 250);
