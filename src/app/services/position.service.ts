import { Injectable, OnDestroy } from '@angular/core';
import { Recording } from '../common/playback/recording';
import { CurrentPositionData, PositionDataTimestamp, UserPositionDataTimestamp } from '../common/playback/position-data';
import { UserService } from './user.service';
import { TimerService } from './timer.service';
import { UserBase } from '../common/user/user';
import { WebSocketSubject, webSocket } from "rxjs/webSocket";
import { MultiplayerState } from '../common/opengoal/multiplayer-state';

@Injectable({
  providedIn: 'root'
})
export class PositionService implements OnDestroy {

  hasDrawnRecordingNames:boolean = false;
  recordings: Recording[] = [];
  userPositionRecording: Recording[] = [];

  private players: CurrentPositionData[] = [];
  private drawPositions: boolean = false;
  private positionUpdateRateMs: number = 16;

  ogSocket: WebSocketSubject<any> = webSocket('ws://localhost:8111');


  constructor(public userService: UserService, public timer: TimerService) {

    this.checkRegisterPlayer(this.userService.user);

    this.ogSocket.subscribe(target => {
      if (target.position) 
        this.updatePosition(new UserPositionDataTimestamp(target.position, this.timer.totalMs, this.userService.getId()));
    });
  }

  resetGetRecordings(): Recording[] {
    const recordings = this.userPositionRecording;
    this.cleanupPlayers();

    this.userPositionRecording = [];
    this.recordings = [];
    this.players = [];
    this.checkRegisterPlayer(this.userService.user);
    return recordings;
  }

  removePlayer(userId: string) {
    this.recordings = this.recordings.filter(x => x.userId !== userId);
    this.userPositionRecording = this.userPositionRecording.filter(x => x.userId !== userId);
    this.players = this.players.filter(x => x.userId !== userId);
  }

  checkRegisterPlayer(user: UserBase | undefined, isRecording: boolean = false) {
    if (!user || this.players.find(x => x.userId === user.id)) return;

    this.players.push(new CurrentPositionData(user));
  }

  addRecording(recording: Recording, user: UserBase) {
    recording.userId = recording.id;
    user.id = recording.id;
    this.checkRegisterPlayer(user);
    this.recordings.push(recording);
  }


  updatePosition(positionData: UserPositionDataTimestamp) {
    let player = this.players.find(x => x.userId === positionData.userId);

    if (player) player.updateCurrentPosition(positionData);
    else if (positionData.userId !== this.userService.getId()) return;


    if (this.timer.totalMs === 0) return;
    //handle user position recording
    let userRecording = this.userPositionRecording.find(x => x.userId === positionData.userId);

    //registner new if missing
    if (!userRecording) {
      userRecording = new Recording(positionData.userId);
      this.userPositionRecording.push(userRecording);
    }

    userRecording.playback.unshift(new PositionDataTimestamp(positionData, positionData.time));
  }

  startDrawPlayers() {
    if (this.drawPositions) return;
    this.drawPositions = true;
    this.drawPlayers();
    this.players.forEach(player => {
      player.mpState = MultiplayerState.connected;
    })
  }

  stopDrawPlayers() {
    this.drawPositions = false;
    this.cleanupPlayers();
  }

  private async drawPlayers() {
    if (!this.drawPositions) return;

    
    if (this.timer.totalMs > 0) {
      this.recordings.forEach(recording => {
        const positionData = recording.playback.find(x => x.time < this.timer.totalMs);
        if (positionData) {
          const currentPlayer = this.players.find(x => x.userId === recording.userId);
          if (currentPlayer)
            currentPlayer.updateCurrentPosition(positionData);
        }
      });
    }

    if (this.timer.totalMs > 200) {
      if (!this.hasDrawnRecordingNames) {
        this.recordings.forEach(recording => {
          const currentPlayer = this.players.find(x => x.userId === recording.userId);
          if (currentPlayer) currentPlayer.username = recording.nameFrontend ?? "BLANK";
        });
      }
    }

    this.updatePlayersInOpengoal();
    await new Promise(r => setTimeout(r, this.positionUpdateRateMs));

    this.drawPlayers();
  }

  private updatePlayersInOpengoal() {
    this.ogSocket.next(this.players);
  }

  private cleanupPlayers() {
    if (!this.players.some(x => x.mpState === MultiplayerState.connected)) return;

    this.players.forEach((player, i) => {
      player.username = "";
      player.transX = -247935.5 + 18000 * Math.cos(2 * Math.PI * i / this.players.length);
      player.transZ = -113691.5 + 18000 * Math.sin(2 * Math.PI * i / this.players.length);
      player.transY = 45472.035;
    });
    this.updatePlayersInOpengoal();
    this.hasDrawnRecordingNames = false;
    
    this.players.forEach(player => {
      player.mpState = MultiplayerState.disconnected;
    });
    setTimeout(() => {
      this.updatePlayersInOpengoal();
    }, this.positionUpdateRateMs);
  }

  ngOnDestroy(): void {
    this.cleanupPlayers();
    this.ogSocket.complete();
  }
}
