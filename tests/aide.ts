import sqlite3InitModule from '@sqlite.org/sqlite-wasm'
import { SqlDb } from '@/db/sql'
import { creerStructure } from '@/repositories/arbre'

const sqlite3 = await sqlite3InitModule()

/** Base vierge en mémoire, éventuellement déjà structurée. */
export function nouvelleBase(structuree = true): SqlDb {
  const db = new SqlDb(new sqlite3.oo1.DB(':memory:', 'c'))
  db.exec('PRAGMA foreign_keys = ON')
  if (structuree) creerStructure(db)
  return db
}
