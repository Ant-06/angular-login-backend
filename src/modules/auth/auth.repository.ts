import User, { IUser } from "./user.model";

export const findUserByEmail = async (email: string): Promise<IUser | null> => {
  return User.findOne({ email });
};

export const createUser = async (
  email: string,
  hashedPassword: string,
): Promise<IUser> => {
  const user = new User({ email, password: hashedPassword });
  return user.save();
};

export const findUserById = async (id: string): Promise<IUser | null> => {
  return User.findById(id).select("-password");
};
