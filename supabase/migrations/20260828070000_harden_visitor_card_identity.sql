begin;

-- ============================================================
-- Visitor-card identifier integrity
-- ============================================================

do $block$
begin
  if exists (
    select 1
    from public.visitor_cards
      as card
    where card.card_number
      is null
  ) then
    raise exception using
      errcode = '23502',
      message =
        'Visitor-card inventory contains a null card number';
  end if;
end;
$block$;

alter table public.visitor_cards
  alter column card_number
    set not null;

comment on column
  public.visitor_cards.card_number
is
  'Required trigger-controlled identifier such as MOF-V168, MOF-VIP025 or MOF-VIP025-R1.';

notify pgrst, 'reload schema';

commit;