export class AuthRequiredError extends Error {
  constructor() {
    super('Accedi per continuare.');
  }
}

export class LocalStorageError extends Error {
  constructor(cause: unknown) {
    super(
      'Archivio dati non disponibile. Il server non riesce a leggere o salvare i dati. Riprova dopo il riavvio del servizio.',
      { cause },
    );
  }
}

export function errorStatus(error: unknown) {
  return error instanceof AuthRequiredError ? 401 : error instanceof LocalStorageError ? 503 : 400;
}
