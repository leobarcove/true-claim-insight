import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: 'events',
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(EventsGateway.name);

  @WebSocketServer()
  server!: Server;

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('join-claim')
  handleJoinClaim(client: Socket, claimId: string) {
    client.join(`claim-${claimId}`);
    this.logger.log(`Client ${client.id} joined claim room: ${claimId}`);
    return { status: 'joined', room: `claim-${claimId}` };
  }

  emitDocumentStatus(claimId: string, documentId: string, status: string) {
    if (this.server) {
      this.server.to(`claim-${claimId}`).emit('document-status-update', {
        claimId,
        documentId,
        status,
      });
    }
  }

  emitTrinityUpdate(claimId: string, status: string) {
    if (this.server) {
      this.server.to(`claim-${claimId}`).emit('trinity-update', {
        claimId,
        status,
      });
    }
  }
}
