-- Make requests.unit_price (added in 0006) trustworthy.
-- Run once by the OWNER in the Supabase web SQL editor, AFTER 0006 and AFTER the
-- fixed-price code is deployed.
--
-- Split out of 0006 for timing, not tidiness: this rule rejects a catalog insert
-- that carries no price, which is exactly what the pre-deploy code sends. Run it
-- early and every catalog order on the live site fails until the deploy lands.
-- 0006 breaks nothing on its own, so the safe sequence is 0006 -> deploy -> 0007
-- and nothing is ever rejected.
--
-- Run the whole sequence in one sitting. 0006 is a no-op for AVAILABILITY, but
-- not for FORGEABILITY: it creates unit_price, and 0003's policy says nothing
-- about that column, so between 0006 and 0007 an anon insert can name its own
-- price. That gap is opened by 0006 and closed here -- it is new and transient,
-- not a pre-existing hole. The yield is minor (the forged row never reaches the
-- server action, sends no email, and anon cannot read back access_token, so it
-- surfaces only as one obviously mispriced order in the admin queue), so this is
-- a reason not to dawdle rather than an emergency. Don't leave it open overnight.

-- The request form submits with the publishable key, so this insert arrives as
-- `anon`: unit_price is browser input like every other column here, and 0003's
-- rule of demanding the money columns be null cannot work for a column the
-- submission must actually fill. Re-derive the price instead of trusting it --
-- the row is only accepted when the submitted price equals the active product's
-- real one, so a hand-crafted POST cannot name its own price. An unknown,
-- inactive or unpriced product makes the subquery NULL, and a NULL with-check
-- fails closed. Non-catalog requests keep the quote flow and carry no price.
--
-- Deliberate consequence: if a product's price changes between the server
-- action's lookup and its insert, the insert fails and the customer sees a
-- generic error. Recording a stale price is the worse outcome, and with a
-- single admin this race is effectively unreachable.
drop policy "Anon insert requests" on public.requests;

create policy "Anon insert requests" on public.requests
  for insert to anon, authenticated
  with check (
    status = 'received'
    and quote_design_fee is null
    and quote_print_fee is null
    and admin_notes is null
    and (type <> 'file' or license_accepted)
    and (
      case
        when type = 'catalog' then unit_price = (
          select p.indicative_price
            from public.products p
           where p.id = requests.product_id
             and p.active
        )
        else unit_price is null
      end
    )
  );
