package com.vinods21.todo.support;

import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.JOSEObjectType;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jose.jwk.gen.RSAKeyGenerator;
import com.nimbusds.jose.util.Base64URL;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.io.OutputStream;
import java.io.UncheckedIOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * SCRUM-13-AC-23 (design §6.2): a stand-in for Keycloak in backend tests — no Keycloak needed. Holds RSA-2048 test key
 * pairs, serves the public key of {@code test-key-1} as a JWKS on a random loopback port ({@code /certs}, JDK
 * {@link HttpServer}) and mints access tokens like Keycloak's (RS256, {@code typ: JWT}, {@code iss}, {@code aud},
 * {@code preferred_username}, {@code realm_access.roles}). The backend validates them through its real decoder path
 * (JWKS fetch, {@code kid} lookup, validators).
 * <p>
 * Test keys only — they never leave the test sources (SCRUM-13-NFR-01).
 */
public final class TestJwtIssuer {

    public static final String ISSUER = "http://issuer.test/realms/todo";
    public static final String AUDIENCE = "todo-api";

    private static final RSAKey PUBLISHED_KEY = generate("test-key-1");
    /** Never published: a token signed with it under its own kid has an unknown kid. */
    private static final RSAKey ROGUE_KEY = generate("rogue-key");

    private static final AtomicBoolean AVAILABLE = new AtomicBoolean(true);
    private static final AtomicInteger JWKS_REQUESTS = new AtomicInteger();
    private static final HttpServer SERVER = startServer();

    private TestJwtIssuer() {
    }

    /** URL of the JWKS endpoint ({@code spring.security.oauth2.resourceserver.jwt.jwk-set-uri}). */
    public static String jwkSetUri() {
        return "http://127.0.0.1:" + SERVER.getAddress().getPort() + "/certs";
    }

    /** SCRUM-13-NFR-06: while false the JWKS endpoint answers 503 (Keycloak down). */
    public static void setAvailable(boolean available) {
        AVAILABLE.set(available);
    }

    public static int jwksRequests() {
        return JWKS_REQUESTS.get();
    }

    /** alice with the application role {@code todo-user} — the default for every authenticated test request. */
    public static String userToken() {
        return token().build();
    }

    /** A valid token without any application role (no {@code realm_access} claim, like Keycloak for carol). */
    public static String noRoleToken() {
        return token().username("carol").roles().build();
    }

    public static Builder token() {
        return new Builder();
    }

    /** {@code alg: none}, unsigned (header and payload only) — must never be accepted. */
    public static String unsignedToken() {
        JWTClaimsSet claims = token().claims();
        String header = Base64URL.encode("{\"alg\":\"none\",\"typ\":\"JWT\"}").toString();
        String payload = Base64URL.encode(claims.toString()).toString();
        return header + "." + payload + ".";
    }

    /** Fluent token builder; defaults = a valid Keycloak-like user access token for alice (role todo-user). */
    public static final class Builder {

        private String issuer = ISSUER;
        private List<String> audiences = List.of(AUDIENCE);
        private String subject = UUID.nameUUIDFromBytes("alice".getBytes(StandardCharsets.UTF_8)).toString();
        private String username = "alice";
        private String email = "alice@corp.example";
        private String name = "Alice User";
        private List<String> roles = List.of("todo-user");
        private Instant issuedAt = Instant.now();
        private Instant notBefore;
        private Duration lifetime = Duration.ofMinutes(5);
        private RSAKey signingKey = PUBLISHED_KEY;
        private String keyId = PUBLISHED_KEY.getKeyID();
        private JOSEObjectType type = JOSEObjectType.JWT;
        private final Map<String, Object> extraClaims = new LinkedHashMap<>();

        public Builder issuer(String value) {
            issuer = value;
            return this;
        }

        public Builder audiences(String... values) {
            audiences = List.of(values);
            return this;
        }

        public Builder subject(String value) {
            subject = value;
            return this;
        }

        public Builder username(String value) {
            username = value;
            return this;
        }

        public Builder email(String value) {
            email = value;
            return this;
        }

        public Builder name(String value) {
            name = value;
            return this;
        }

        /** Realm roles; none = no {@code realm_access} claim at all. */
        public Builder roles(String... values) {
            roles = List.of(values);
            return this;
        }

        /** Issued {@code age} ago with the given lifetime: e.g. age 10 min, lifetime 5 min = expired 5 min ago. */
        public Builder issuedAgo(Duration age) {
            issuedAt = Instant.now().minus(age);
            return this;
        }

        public Builder lifetime(Duration value) {
            lifetime = value;
            return this;
        }

        public Builder notBefore(Instant value) {
            notBefore = value;
            return this;
        }

        /** Signed with the unpublished key under its own kid ({@code rogue-key}): unknown kid. */
        public Builder unknownKeyId() {
            signingKey = ROGUE_KEY;
            keyId = ROGUE_KEY.getKeyID();
            return this;
        }

        /** Signed with the unpublished key but claiming the published kid: the signature does not verify. */
        public Builder badSignature() {
            signingKey = ROGUE_KEY;
            keyId = PUBLISHED_KEY.getKeyID();
            return this;
        }

        /** A kid nobody has seen (forces a JWKS re-fetch), signed with the published key. */
        public Builder freshKeyId() {
            keyId = "fresh-" + UUID.randomUUID();
            return this;
        }

        public Builder type(JOSEObjectType value) {
            type = value;
            return this;
        }

        public Builder claim(String claimName, Object value) {
            extraClaims.put(claimName, value);
            return this;
        }

        JWTClaimsSet claims() {
            JWTClaimsSet.Builder claims = new JWTClaimsSet.Builder()
                    .issuer(issuer)
                    .audience(audiences)
                    .subject(subject)
                    .jwtID(UUID.randomUUID().toString())
                    .issueTime(Date.from(issuedAt))
                    .expirationTime(Date.from(issuedAt.plus(lifetime)))
                    .claim("typ", "Bearer")
                    .claim("azp", "todo-frontend");
            if (notBefore != null) {
                claims.notBeforeTime(Date.from(notBefore));
            }
            if (username != null) {
                claims.claim("preferred_username", username);
            }
            if (email != null) {
                claims.claim("email", email).claim("email_verified", true);
            }
            if (name != null) {
                claims.claim("name", name);
            }
            if (!roles.isEmpty()) {
                claims.claim("realm_access", Map.of("roles", new ArrayList<>(roles)));
            }
            extraClaims.forEach(claims::claim);
            return claims.build();
        }

        public String build() {
            JWSHeader.Builder header = new JWSHeader.Builder(JWSAlgorithm.RS256).keyID(keyId);
            if (type != null) {
                header.type(type);
            }
            SignedJWT jwt = new SignedJWT(header.build(), claims());
            try {
                jwt.sign(new RSASSASigner(signingKey));
            } catch (JOSEException e) {
                throw new IllegalStateException("cannot sign test token", e);
            }
            return jwt.serialize();
        }
    }

    private static RSAKey generate(String keyId) {
        try {
            return new RSAKeyGenerator(2048).keyID(keyId).generate();
        } catch (JOSEException e) {
            throw new IllegalStateException("cannot generate test key " + keyId, e);
        }
    }

    private static HttpServer startServer() {
        try {
            HttpServer server = HttpServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), 0), 0);
            byte[] jwks = new JWKSet(PUBLISHED_KEY.toPublicJWK()).toString().getBytes(StandardCharsets.UTF_8);
            server.createContext("/certs", exchange -> {
                JWKS_REQUESTS.incrementAndGet();
                try (exchange; OutputStream body = exchange.getResponseBody()) {
                    if (!AVAILABLE.get()) {
                        exchange.sendResponseHeaders(503, -1);
                        return;
                    }
                    exchange.getResponseHeaders().add("Content-Type", "application/json");
                    exchange.sendResponseHeaders(200, jwks.length);
                    body.write(jwks);
                }
            });
            server.start();
            Runtime.getRuntime().addShutdownHook(new Thread(() -> server.stop(0)));
            return server;
        } catch (IOException e) {
            throw new UncheckedIOException("cannot start the test JWKS server", e);
        }
    }
}
