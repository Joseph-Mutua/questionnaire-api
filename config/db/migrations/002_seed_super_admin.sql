INSERT INTO users (email, password) VALUES ('Mutuaj793@gmail.com', '123456789') 
ON CONFLICT (email) DO NOTHING;

-- Get the user_id of the super-admin user
DO $$
DECLARE
    super_admin_id INTEGER;
BEGIN
    SELECT user_id INTO super_admin_id FROM users WHERE email = 'Mutuaj793@gmail.com';

    -- Insert the super-admin role for the user
    INSERT INTO user_roles (user_id, role_id)
    SELECT super_admin_id, role_id FROM roles WHERE name = 'SuperAdmin'
    ON CONFLICT (user_id, role_id) DO NOTHING;
END $$;