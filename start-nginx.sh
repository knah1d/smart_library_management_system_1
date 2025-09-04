sudo cp /home/nahid/Desktop/6th_SEM/DistSys/smart-library/nginx/smart-library.conf /etc/nginx/sites-available/ && 
sudo ln -s /etc/nginx/sites-available/smart-library.conf /etc/nginx/sites-enabled/ &&
sudo nginx -t && 
sudo systemctl reload nginx