#ifndef AES_CTR_H
#define AES_CTR_H

#include <stdint.h>
#include <stddef.h>

#define AES_KEY_SIZE 32
#define AES_BLOCK_SIZE 16

typedef struct {
    uint32_t round_keys[60];
    uint8_t iv[AES_BLOCK_SIZE];
    uint8_t ecount_buf[AES_BLOCK_SIZE];
    unsigned int num;
} aes_ctr_ctx_t;

void aes_ctr_init(aes_ctr_ctx_t *ctx, const uint8_t *key, const uint8_t *iv);
void aes_ctr_crypt(aes_ctr_ctx_t *ctx, const uint8_t *in, uint8_t *out, size_t len);

#endif /* AES_CTR_H */
