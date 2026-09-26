// apps/api/src/modules/collaboration/collaboration.permissions.ts
// Domain: Team & Collaboration
//
// Any authenticated user may bootstrap/own one organization (SRS Team &
// Collaboration §13.2 role list starts at Owner). Finer-grained invite/role
// permissions land when the Casting/Team hardening phase (Phase 11) builds
// real invite flows; for Phase 1 there is nothing further to check here
// beyond "is signed in", which the auth infrastructure hook already enforces.
export {};
