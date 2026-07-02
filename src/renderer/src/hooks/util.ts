import { userService } from '@renderer/services'
import secureStorageService from '@renderer/services/secure-storage.service'

const getAvatarUrl: () => Promise<string | null> = async () => {
  const uInfo = await secureStorageService.getUserInfo()
  if (!uInfo) return null
  const url = uInfo?.avatarUrl || ''
  const [, fileName] = url.split('/')
  const avatarUrlRes = await userService.getAvatarUrl(fileName)
  console.log('avatarUrl:', avatarUrlRes)
  return avatarUrlRes?.data?.url || ''
}

export { getAvatarUrl }
