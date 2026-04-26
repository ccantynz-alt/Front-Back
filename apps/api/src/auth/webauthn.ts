import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import type {
  GenerateRegistrationOptionsOpts,
  GenerateAuthenticationOptionsOpts,
  VerifiedRegistrationResponse,
  VerifiedAuthenticationResponse,
  VerifyRegistrationResponseOpts,
  VerifyAuthenticationResponseOpts,
} from "@simplewebauthn/server";
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/server";

const RP_NAME = "Crontech";

function getRpId(): string {
  return process.env["WEBAUTHN_RP_ID"] ?? "localhost";
}

function getOrigin(): string {
  return process.env["WEBAUTHN_ORIGIN"] ?? `http://${getRpId()}:3000`;
}

export interface UserForRegistration {
  id: string;
  email: string;
  displayName: string;
}

export interface ExistingCredential {
  id: string;
  credentialId: string;
  transports: string | null;
}

function parseTransports(
  transports: string | null,
): AuthenticatorTransportFuture[] | undefined {
  if (!transports) return undefined;
  try {
    return JSON.parse(transports) as AuthenticatorTransportFuture[];
  } catch (err) {
    throw new Error(`Failed to parse transports value: ${String(err)}`);
  }
}

function buildCredentialDescriptor(
  credentialId: string,
  transports: string | null,
): { id: string; transports?: AuthenticatorTransportFuture[] } {
  const parsed = parseTransports(transports);
  if (parsed) {
    return { id: credentialId, transports: parsed };
  }
  return { id: credentialId };
}

export async function generateRegistrationOpts(
  user: UserForRegistration,
  existingCredentials: ExistingCredential[] = [],
): Promise<PublicKeyCredentialCreationOptionsJSON> {
  const opts: GenerateRegistrationOptionsOpts = {
    rpName: RP_NAME,
    rpID: getRpId(),
    userID: new TextEncoder().encode(user.id),
    userName: user.email,
    userDisplayName: user.displayName,
    attestationType: "none",
    excludeCredentials: existingCredentials.map((cred) =>
      buildCredentialDescriptor(cred.credentialId, cred.transports),
    ),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
      authenticatorAttachment: "platform",
    },
  };

  return generateRegistrationOptions(opts);
}

export async function verifyRegistration(
  response: RegistrationResponseJSON,
  expectedChallenge: string,
): Promise<VerifiedRegistrationResponse> {
  const opts: VerifyRegistrationResponseOpts = {
    response,
    expectedChallenge,
    expectedOrigin: getOrigin(),
    expectedRPID: getRpId(),
    requireUserVerification: false,
  };

  return verifyRegistrationResponse(opts);
}

export async function generateAuthenticationOpts(
  allowCredentials?: ExistingCredential[],
): Promise<PublicKeyCredentialRequestOptionsJSON> {
  const opts: GenerateAuthenticationOptionsOpts = {
    rpID: getRpId(),
    userVerification: "preferred",
    ...(allowCredentials
      ? {
          allowCredentials: allowCredentials.map((cred) =>
            buildCredentialDescriptor(cred.credentialId, cred.transports),
          ),
        }
      : {}),
  };

  return generateAuthenticationOptions(opts);
}

export interface StoredCredential {
  credentialId: string;
  publicKey: Uint8Array;
  counter: number;
  transports: string | null;
}

export async function verifyAuthentication(
  response: AuthenticationResponseJSON,
  credential: StoredCredential,
  expectedChallenge: string,
): Promise<VerifiedAuthenticationResponse> {
  const opts: VerifyAuthenticationResponseOpts = {
    response,
    expectedChallenge,
    expectedOrigin: getOrigin(),
    expectedRPID: getRpId(),
    requireUserVerification: false,
    credential: {
      ...buildCredentialDescriptor(
        credential.credentialId,
        credential.transports,
      ),
      publicKey: new Uint8Array(credential.publicKey),
      counter: credential.counter,
    },
  };

  return verifyAuthenticationResponse(opts);
}

// Re-export types for consumers
export type { RegistrationResponseJSON, AuthenticationResponseJSON };