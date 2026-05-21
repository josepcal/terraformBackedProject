RUN PKCE Test app (only BFF)

		self-signed certificate for nginx added on truststore 


				$ echo | openssl s_client -connect <NGINX-IP>>:443 2>/dev/null | \
				 openssl x509 > keycloak-cert.pem
								
				$ sudo cp keycloak-cert.pem /usr/local/share/ca-certificates/keycloak-cert.crt
				[sudo] password for <<system_user>>:
				
				$ sudo update-ca-certificates   # type your WSL password CAREFULLY this time
				Updating certificates in /etc/ssl/certs...
				0 added, 0 removed; done.
				Running hooks in /etc/ca-certificates/update.d...
				done.


		start the app using system CA
		
				$node --use-system-ca --loader ts-node/esm src/server.ts