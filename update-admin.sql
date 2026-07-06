USE innerquest;
UPDATE user SET `password_hash`='$2b$10$XFi4JRIEhRnz79OsFMrpreGNKq1wmeWjQL530fX0JobG5EYuxDzju' WHERE email='admin@innerquest.local';
SELECT id, email, password_hash FROM user WHERE email='admin@innerquest.local';