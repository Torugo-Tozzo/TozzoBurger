// Fixed UUIDs assigned to the seed product types during the Int->UUID
// migration of ProductType.id (2026-08-28). Must stay in sync with
// api-tozzo.uk/types/productTypes.ts (ProductTypeId enum) — these are real
// Postgres rows, not derivable at runtime.
export enum ProductTypeId {
  BURGER = '3dfd26ba-adb8-476a-bcc4-fbe425f4a7df',
  ARTISAN_BURGER = '91f4a705-c98c-411a-a680-86b2f263c931',
  CHICKEN = '6af5decb-14b6-4da4-ac73-a770f3238d2e',
  HOT_DOG = 'c54eb15d-a5f8-4131-9f1c-cf7973d8540d',
  DRINK = '4693880c-7ea9-4da6-8fdf-669ec29b9755',
  FRENCH_FRIES = '32811337-f5fd-44bc-978f-5b8e93eac66a',
  ADD_ON = '715085f9-1d12-49ba-81fc-25ae1b52b66b',
  OTHER = 'f7bf1157-f9d9-4d97-aaef-1c9254f01a35',
  PIZZA = 'f1a38ca4-7ac0-440a-a7d8-c0d9130aafe6',
  SUSHI = 'deba4d0b-371c-4a6a-9351-b9ab2837e6ce',
}
