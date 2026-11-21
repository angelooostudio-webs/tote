-- shipping orders carry the address from the site's order form
ALTER TABLE orders ADD COLUMN address TEXT;
ALTER TABLE orders ADD COLUMN city TEXT;
