import mongoose, { Document, Model, Schema, Types } from "mongoose";

export interface ISession extends Document {
  userId: Types.ObjectId;
  familyId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt?: Date | null;
  replacedByHash?: string | null;
  successorSessionId?: string | null;
  familyRevoked?: boolean;
  revokeReason?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

const sessionSchema = new Schema<ISession>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    familyId: { type: String, required: true, index: true },
    tokenHash: { type: String, required: true, unique: true, index: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    replacedByHash: { type: String, default: null },
    successorSessionId: { type: String, default: null },
    familyRevoked: { type: Boolean, default: false, index: true },
    revokeReason: { type: String, default: null },
  },
  { timestamps: true },
);

sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const Session: Model<ISession> = mongoose.model<ISession>(
  "Session",
  sessionSchema,
);

export default Session;
