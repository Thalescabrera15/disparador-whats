-- Idempotência do inbound: impede gravar a mesma mensagem (waMessageId) duas
-- vezes no mesmo chip. NULLs são distintos no Postgres, então mensagens OUT
-- (sem waMessageId) não conflitam.
CREATE UNIQUE INDEX "Message_chipId_waMessageId_key" ON "Message"("chipId", "waMessageId");
