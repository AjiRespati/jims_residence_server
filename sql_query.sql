


---------------------
-- FIX EMAIL SALES --
---------------------


UPDATE "public"."Invoices"
SET "dueDate" = '2025-06-18T00:00:00+07:00'
WHERE id = 'f4fd5656-a9a0-455a-8fc6-547edae73c06';


UPDATE "public"."Invoices"
SET "dueDate" = '2025-06-14T00:00:00+07:00'
WHERE id = '09fcdc9c-e08d-400d-9805-065409202969';


UPDATE "public"."Invoices"
SET "dueDate" = '2025-06-15T00:00:00+07:00'
WHERE id = 'edb9f054-d1b8-439d-bf2b-742080689090';


GRANT ALL PRIVILEGES ON TABLE "public"."Transactions" TO wjccfjxl;


UPDATE "public"."Invoices"
SET "dueDate" = '2025-05-30T00:00:00+07:00'
WHERE id = '7d235147-99a4-4c86-8349-d29b315c898d';


UPDATE "public"."Invoices"
SET "dueDate" = '2025-06-14T00:00:00+07:00'
WHERE id = '2856726f-a3c7-49c0-8631-7b5de7021566';


UPDATE "public"."Invoices"
SET "dueDate" = '2025-05-02T00:00:00+07:00'
WHERE id = 'e1beae08-24a9-4d16-b3fa-8362ee3c0667';


UPDATE "public"."Invoices"
SET "dueDate" = '2025-05-28T00:00:00+07:00'
WHERE id = 'ef9fa777-bb5d-4334-8fba-5751eabdfa2c';

UPDATE "public"."Rooms"
SET "priceId" = null
WHERE id = '22c7503c-1e31-4cec-ae9f-447ec9a0ba54';

-------------------------------------
-- FIX INACTIVE TENANT NIK n PHONE --
-------------------------------------

UPDATE "public"."Tenants"
SET "NIKNumber" = 'NIKNumber08', "phone" = 'phone08'
WHERE id = 'b1fe3e21-4e88-4c36-a464-efd39a40ff24';

UPDATE "public"."Tenants"
SET "NIKNumber" = 'NIKNumber02', "phone" = 'phone02'
WHERE id = '7b88fed1-d0c1-4668-b667-f9c09bfdaeb0';

UPDATE "public"."Tenants"
SET "NIKNumber" = 'NIKNumber03', "phone" = 'phone03'
WHERE id = 'b1fe3e21-4e88-4c36-a464-efd39a40ff24';

UPDATE "public"."Tenants"
SET "NIKNumber" = 'NIKNumber04', "phone" = 'phone04'
WHERE id = 'de24bee0-b5a6-47dc-960a-abef4e4ef4bc';

UPDATE "public"."Tenants"
SET "NIKNumber" = 'NIKNumber05', "phone" = 'phone05'
WHERE id = '0915118f-6d5c-4518-a667-15f7b83ac783';

UPDATE "public"."Tenants"
SET "NIKNumber" = 'NIKNumber06', "phone" = 'phone06'
WHERE id = '42ea2e36-d16e-4ca8-8a06-e277fef79f03';

UPDATE "public"."Tenants"
SET "NIKNumber" = 'NIKNumber07', "phone" = 'phone07'
WHERE id = '5cdf716c-6f86-4abe-b2b3-a934b9c72b02';


-------------------------------------
-- UPDATE USER LEVEL               --
-------------------------------------

UPDATE "public"."Users"
SET "levelDesc" = 'Pemilik', "level" = 2
WHERE id = 'b9f0e8f6-3b8b-4dcb-bfde-3fb4a02db852';



------------------------------------
-- DELETE ROOMS                   --
------------------------------------

DELETE FROM "public"."Rooms"
WHERE "id" = 'b8673338-1c63-473a-acf9-d8f31cdc6bc9';

DELETE FROM "public"."Rooms"
WHERE "id" = 'ca9def50-c484-4a7d-8a8a-56892a0f7a8b';

DELETE FROM "public"."Rooms"
WHERE "id" = 'cab0c900-8de7-48bb-a380-4c64ecdf6d76';

DELETE FROM "public"."Rooms"
WHERE "id" = 'bdd5ea98-d12a-4abf-b763-6f215c21f289';

DELETE FROM "public"."Rooms"
WHERE "id" = '07d1ba04-4679-4172-aea0-45a2e4aa49d4';