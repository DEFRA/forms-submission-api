location / {
    if ($request_method = OPTIONS) {
        add_header "Access-Control-Allow-Origin" "http://localhost:3009" always;
        add_header "Access-Control-Allow-Methods" "GET, POST, OPTIONS" always;
        add_header "Access-Control-Allow-Headers" "Origin, Content-Type, Accept, Authorization" always;
        add_header "Access-Control-Max-Age" 1728000 always;
        return 204;
    }

    proxy_pass http://cdp-uploader:7337;
    proxy_redirect off;

    add_header "Access-Control-Allow-Origin" "http://localhost:3009" always;
    add_header "Access-Control-Allow-Methods" "GET, POST, OPTIONS" always;
    add_header "Access-Control-Allow-Headers" "Origin, Content-Type, Accept, Authorization" always;
}