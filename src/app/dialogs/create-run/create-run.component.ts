import { Component } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { CitadelOptions, RunData } from 'src/app/common/run/run-data';
import { FireStoreService } from 'src/app/services/fire-store.service';
import pkg from 'app/package.json';
import { RunMode } from 'src/app/common/run/run-mode';
import { Lobby } from 'src/app/common/firestore/lobby';
import { Preset } from 'src/app/common/firestore/preset';
import { UserService } from 'src/app/services/user.service';

@Component({
  selector: 'app-create-run',
  templateUrl: './create-run.component.html',
  styleUrls: ['./create-run.component.scss']
})
export class CreateRunComponent {

  runData: RunData = new RunData(pkg.version);
  teamsOptions: number[] = [1, 2, 3, 4];
  countdownOptions: number[] = [5, 10, 15];
  citadelSkipOptions: number[] = [0, 1, 2];
  password: string | null = null;

  runMode = RunMode;
  citadelOptions = CitadelOptions;

  tournamentPreset: Preset;
  usingPreset: boolean;

  constructor(private _user: UserService, private _firestore: FireStoreService, private router: Router, private dialogRef: MatDialogRef<CreateRunComponent>) {
    this.getPreset();
  }

  createRun() {
    this.runData.buildVersion = pkg.version;
    const lobby = new Lobby(this.runData, this._user.getId(), this.password);
    this._firestore.addLobby(lobby);
    this.router.navigate(['/run'], { queryParams: { id: lobby.id } });
    this.dialogRef.close();
  }

  async getPreset() {
    this.tournamentPreset = await this._firestore.getPreset("tournament") ?? new Preset(this.runData);
  }

  usePreset() {
    this.usingPreset = true;
    this.runData = this.tournamentPreset.runData;
  }

  changeMode() {
    if (this.runData.mode === RunMode.Lockout && this.runData.teams === 1) {
        this.runData.teams = 2;
    }
  }
  changeTeams() {
    if (this.runData.mode === RunMode.Lockout && this.runData.teams === 1) {
        this.runData.requireSameLevel = false;
    }
  }
}
