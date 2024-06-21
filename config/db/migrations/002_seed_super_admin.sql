DO $$
DECLARE
    super_admin_id INTEGER;
BEGIN
    INSERT INTO users (email, password, role) 
    VALUES ('Mutuaj793@gmail.com', '123456789', 'SUPERADMIN') 
    ON CONFLICT (email) DO NOTHING;
END $$;
