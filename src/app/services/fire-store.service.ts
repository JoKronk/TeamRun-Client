import { Injectable } from '@angular/core';
import { AngularFirestore, AngularFirestoreCollection, AngularFirestoreDocument } from '@angular/fire/compat/firestore';
import { Observable } from 'rxjs';
import { CollectionName } from '../common/firestore/collection-name';
import { Lobby } from '../common/firestore/lobby';
import { Run } from '../common/run/run';

@Injectable({
  providedIn: 'root'
})
export class FireStoreService {

  private runs: AngularFirestoreCollection<Run>;
  private lobbies: AngularFirestoreCollection<Lobby>;

  constructor(public firestore: AngularFirestore) {
    this.runs = firestore.collection<Run>(CollectionName.runs);
    this.lobbies = firestore.collection<Lobby>(CollectionName.lobbies);
  }

  getOpenLobbies() {
    return this.firestore.collection<Lobby>(CollectionName.lobbies, ref => ref.where('visible', '==', true)).valueChanges();
  }

  async addLobby(lobby: Lobby) {
    await this.lobbies.doc<Lobby>(lobby.id).set(JSON.parse(JSON.stringify(lobby)));
  }

  async deleteOldLobbies() {
    const expireDate = new Date();
    expireDate.setDate(expireDate.getDate() - 1);

    (await this.lobbies.ref.get()).forEach((lobbySnapshot) => {
      let lobby = lobbySnapshot.data();
      if (new Date(lobby.creationDate) < expireDate)
        this.lobbies.doc<Lobby>(lobbySnapshot.id).delete();
    });
  }

  async getRun(id: string) {
    return (await this.runs.doc(id).ref.get()).data();
  }

  async addRun(run:Run) {
    //class needs to be object, Object.assign({}, run); doesn't work either due to nested objects
    await this.runs.doc<Run>().set(JSON.parse(JSON.stringify(run)));
  }
}
